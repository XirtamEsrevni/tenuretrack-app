import { useState, useCallback, useRef } from 'react';
import type { UserDetails, Topic, ReportData, ProgressEvent, WizardStep, FunnelRow } from '../types';
import { OpenAlexClient, type OpenAlexAuthor } from '../lib/openalex';
import { buildReport, type CohortMember } from '../lib/report';
import { estimateStart, plausibleYears, coreTopicShare } from '../lib/career';
import { isJournalArticle } from '../lib/metrics';
import { exampleReport } from '../data/exampleData';

const HORIZON_YEARS = 6;

export function useTenureTrack() {
  const [step, setStep] = useState<WizardStep>('details');
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittingDetails, setSubmittingDetails] = useState(false);
  const [building, setBuilding] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const addProgress = useCallback((stage: string, message: string, detail?: string) => {
    setProgress((prev) => [...prev, { stage, message, detail }]);
  }, []);

  const submitDetails = useCallback(async (details: UserDetails) => {
    setUserDetails(details);
    setError(null);
    setProgress([]);

    if (!details.email || !details.orcid || !details.university || !details.startYear) {
      setError('Please fill in all fields.');
      return;
    }

    setSubmittingDetails(true);
    addProgress('init', 'Resolving your ORCID with OpenAlex...');

    try {
      const client = new OpenAlexClient(details.email, details.apiKey);
      client.setProgressHandler((msg, d) => addProgress('init', msg, d));

      const author = await client.getAuthorByOrcid(details.orcid);
      addProgress('init', `Found: ${author.display_name}`, `${author.works_count} works`);

      const works = await client.getWorksByAuthor(author.id);
      addProgress('init', `Fetched ${works.length} of your works`);

      const windowWorks = works.filter((w) => {
        if (!isJournalArticle(w)) return false;
        const careerYear = w.publication_year - details.startYear + 1;
        return careerYear >= 1 && careerYear <= HORIZON_YEARS;
      });

      const topicMap = new Map<string, Topic>();
      for (const work of windowWorks) {
        const pt = work.primary_topic;
        if (!pt) continue;
        const id = pt.id.replace('https://openalex.org/', '');
        const existing = topicMap.get(id);
        if (existing) {
          existing.paperCount++;
          const source = work.primary_location?.source?.display_name;
          if (source && !existing.topVenues.includes(source)) {
            existing.topVenues.push(source);
          }
        } else {
          const source = work.primary_location?.source?.display_name;
          topicMap.set(id, {
            id,
            name: pt.display_name,
            paperCount: 1,
            topVenues: source ? [source] : [],
          });
        }
      }

      const proposedTopics = [...topicMap.values()]
        .filter((t) => t.paperCount >= 1)
        .sort((a, b) => b.paperCount - a.paperCount)
        .slice(0, 6);

      setTopics(proposedTopics);
      setSelectedTopicIds(proposedTopics.map((t) => t.id));
      addProgress('init', `Proposed ${proposedTopics.length} topics from your papers`);
      setStep('topics');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('quota') || msg.includes('429')) {
        setError('OpenAlex daily quota exhausted. Add a free API key from openalex.org/settings/api for 10x the daily allowance, or try again tomorrow.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmittingDetails(false);
    }
  }, [addProgress]);

  const confirmTopics = useCallback((topicIds: string[]) => {
    setSelectedTopicIds(topicIds);
    setStep('build');
  }, []);

  const runBuild = useCallback(async () => {
    if (!userDetails) return;
    setBuilding(true);
    setError(null);
    setSubmittingDetails(false);
    setProgress([]);
    abortRef.current = new AbortController();

    const details = userDetails;
    const articleTypes = ['article'];

    try {
      const client = new OpenAlexClient(details.email, details.apiKey);
      client.setProgressHandler((msg, d) => addProgress('cohort', msg, d));

      addProgress('cohort', 'Resolving your author record...');
      const subjectAuthor = await client.getAuthorByOrcid(details.orcid);
      addProgress('cohort', `Subject: ${subjectAuthor.display_name}`);

      addProgress('cohort', 'Fetching your works...');
      const subjectWorks = await client.getWorksByAuthor(subjectAuthor.id);
      addProgress('cohort', `Fetched ${subjectWorks.length} subject works`);

      const funnelRows: FunnelRow[] = [];
      let stepNum = 0;

      stepNum++;
      addProgress('cohort', 'Building candidate pool from topics...');
      const allCandidates: OpenAlexAuthor[] = [];
      for (const tid of selectedTopicIds) {
        const fullId = `https://openalex.org/${tid}`;
        const authors = await client.getAuthorsByTopic(fullId, ['US']);
        allCandidates.push(...authors);
      }

      const uniqueCandidates = new Map<string, OpenAlexAuthor>();
      for (const a of allCandidates) {
        if (a.id !== subjectAuthor.id) {
          uniqueCandidates.set(a.id, a);
        }
      }
      funnelRows.push({
        step: stepNum,
        label: 'candidates',
        rule: `topics ${selectedTopicIds.join('|')}, at least 10 works, an affiliation in US, not the subject themselves`,
        kept: uniqueCandidates.size,
        dropped: 0,
      });
      addProgress('cohort', `Candidates: ${uniqueCandidates.size}`);

      stepNum++;
      addProgress('cohort', 'Filtering by core topic share (>= 0.4)...');
      const shareFiltered = [...uniqueCandidates.values()].filter(
        (a) => coreTopicShare(a, selectedTopicIds) >= 0.4,
      );
      funnelRows.push({
        step: stepNum,
        label: 'core topic share',
        rule: 'share of work in the subfield at least 0.4',
        kept: shareFiltered.length,
        dropped: uniqueCandidates.size - shareFiltered.length,
      });
      addProgress('cohort', `After core topic share: ${shareFiltered.length}`);

      stepNum++;
      addProgress('cohort', 'Filtering for university affiliations...');
      const eduFiltered = shareFiltered.filter((a) =>
        a.affiliations.some((aff) => aff.institution.type === 'education'),
      );
      funnelRows.push({
        step: stepNum,
        label: 'university',
        rule: 'an affiliation of type education',
        kept: eduFiltered.length,
        dropped: shareFiltered.length - eduFiltered.length,
      });
      addProgress('cohort', `With university affiliation: ${eduFiltered.length}`);

      stepNum++;
      const windowStart = details.startYear - 10;
      const windowEnd = details.startYear + 10;
      addProgress('cohort', `Filtering for plausible start years (${windowStart} to ${windowEnd})...`);

      const candidateIds = eduFiltered.map((a) => a.id);
      const maxCandidates = 200;
      const cappedIds = candidateIds.slice(0, maxCandidates);
      if (candidateIds.length > maxCandidates) {
        addProgress('cohort', `Capped to top ${maxCandidates} candidates by topic share`);
      }

      addProgress('cohort', `Fetching works for ${cappedIds.length} candidates...`);
      const worksMap = await client.getWorksByAuthors(cappedIds);
      addProgress('cohort', 'Works fetched');

      const plausibleFiltered: string[] = [];
      for (const id of cappedIds) {
        const works = worksMap.get(id) ?? [];
        if (plausibleYears(works, windowStart, windowEnd)) {
          plausibleFiltered.push(id);
        }
      }
      funnelRows.push({
        step: stepNum,
        label: 'plausible years',
        rule: `byline years could contain a start between ${windowStart} and ${windowEnd}`,
        kept: plausibleFiltered.length,
        dropped: cappedIds.length - plausibleFiltered.length,
      });
      addProgress('cohort', `Plausible years: ${plausibleFiltered.length}`);

      stepNum++;
      addProgress('cohort', 'Estimating career starts...');
      const cohortMembers: CohortMember[] = [];
      let estimated = 0;
      for (let i = 0; i < plausibleFiltered.length; i++) {
        const authorId = plausibleFiltered[i];
        const works = worksMap.get(authorId) ?? [];
        const estimate = estimateStart(works, authorId, articleTypes);
        if (estimate.confidence === 'high' && estimate.year != null) {
          estimated++;
          if (estimate.year >= windowStart && estimate.year <= windowEnd) {
            cohortMembers.push({
              authorId,
              startYear: estimate.year,
              works,
            });
          }
        }
        if (i % 50 === 0) {
          addProgress('cohort', `Estimating starts... ${i}/${plausibleFiltered.length}`, `${estimated} confident so far`);
        }
      }
      funnelRows.push({
        step: stepNum,
        label: 'career start estimated',
        rule: 'a confident first independent start (at least 2 led papers at one institution, with earlier trainee years elsewhere)',
        kept: estimated,
        dropped: plausibleFiltered.length - estimated,
      });
      stepNum++;
      funnelRows.push({
        step: stepNum,
        label: 'start in window',
        rule: `estimated start between ${windowStart} and ${windowEnd}`,
        kept: cohortMembers.length,
        dropped: estimated - cohortMembers.length,
      });
      addProgress('cohort', `Cohort: ${cohortMembers.length} people`);

      if (cohortMembers.length < 5) {
        addProgress('cohort', `Warning: cohort has only ${cohortMembers.length} people. Quartiles may be unreliable.`);
      }

      addProgress('report', 'Computing metrics and quartiles...');
      const subfieldLabel = topics.find((t) => t.id === selectedTopicIds[0])?.name ?? 'your subfield';
      const result = buildReport(
        subjectAuthor.display_name,
        details.university,
        details.startYear,
        details.clockExtensionYears,
        subjectWorks,
        cohortMembers,
        articleTypes,
        funnelRows,
        subfieldLabel,
      );

      setReport(result.report);
      addProgress('report', 'Report ready.');
      setStep('report');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('quota') || msg.includes('429')) {
        setError('OpenAlex daily quota exhausted. Add a free API key for 10x the daily allowance, or try again tomorrow. Your progress is cached.');
      } else {
        setError(msg);
      }
    } finally {
      setBuilding(false);
    }
  }, [userDetails, selectedTopicIds, topics, addProgress]);

  const loadExample = useCallback(() => {
    setReport(exampleReport);
    setStep('report');
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStep('details');
    setUserDetails(null);
    setTopics([]);
    setSelectedTopicIds([]);
    setProgress([]);
    setReport(null);
    setError(null);
    setBuilding(false);
  }, []);

  return {
    step,
    userDetails,
    topics,
    selectedTopicIds,
    progress,
    report,
    error,
    submittingDetails,
    building,
    submitDetails,
    confirmTopics,
    runBuild,
    loadExample,
    reset,
    setStep,
  };
}
