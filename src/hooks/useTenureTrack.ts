import { useState, useCallback, useRef } from 'react';
import type { UserDetails, Topic, ReportData, ProgressEvent, WizardStep, FunnelRow } from '../types';
import { OpenAlexClient, isAbortError, type OpenAlexAuthor } from '../lib/openalex';
import { buildReport, type CohortMember } from '../lib/report';
import {
  estimateStart,
  plausibleYears,
  coreTopicShare,
  rankAndCap,
  capCutoffShare,
} from '../lib/career';
import {
  firstBylineYear,
  HORIZON_YEARS,
  MAX_CANDIDATES,
  proposeTopics,
  resolveInstitution,
  resolvedStartWindow,
} from '../lib/subject';
import { sameId, shortId } from '../lib/ids';
import { exampleReport } from '../data/exampleData';

export function useTenureTrack() {
  const [step, setStep] = useState<WizardStep>('details');
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [subjectAuthor, setSubjectAuthor] = useState<OpenAlexAuthor | null>(null);
  const [institutionRor, setInstitutionRor] = useState<string>('');
  const [institutionName, setInstitutionName] = useState<string>('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
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

    addProgress('init', 'Resolving your ORCID with OpenAlex...');
    setDetailsLoading(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      const client = new OpenAlexClient(details.email, details.apiKey);
      client.setProgressHandler((msg, d) => addProgress('init', msg, d));
      client.setAbortSignal(signal);

      const author = await client.getAuthorByOrcid(details.orcid);
      addProgress('init', `Found: ${author.display_name}`, `${author.works_count} works`);

      const place = resolveInstitution(author, details.university);
      if (!place) {
        addProgress(
          'init',
          `Could not match "${details.university}" to an affiliation on your OpenAlex record. Papers will not be institution-anchored.`,
          'Use the name as it appears on your papers, or paste a ROR, and try again if the subject numbers look too high.',
        );
      }
      setSubjectAuthor(author);
      setInstitutionRor(place?.ror ?? '');
      setInstitutionName(place?.name ?? details.university);
      if (place?.ror) {
        addProgress('init', `Institution: ${place.name}`, `ROR ${place.ror}`);
      }

      const works = await client.getWorksByAuthor(author.id);
      if (signal.aborted) return;
      addProgress('init', `Fetched ${works.length} of your works`);

      const ror = place?.ror ?? '';
      const first = ror ? firstBylineYear(works, author.id, ror) : null;
      if (first != null && Math.abs(first - details.startYear) > 1) {
        addProgress(
          'init',
          `Start year check: first ${place?.name ?? details.university} byline is ${first}, appointment given as ${details.startYear}.`,
          'A gap of more than a year is often a typo; papers lagging the appointment by one year is normal.',
        );
      }

      const { topics: proposed, basis } = proposeTopics(
        works,
        author.id,
        ror,
        details.startYear,
      );
      if (basis !== 'anchored') {
        addProgress(
          'init',
          ror
            ? `Fewer than five institution-anchored papers, so topics were proposed from ${basis === 'since_start' ? 'every article since the appointment' : 'the whole record'}.`
            : 'Topics were proposed from your papers without an institution filter.',
        );
      }

      if (signal.aborted) return;
      setTopics(proposed);
      setSelectedTopicIds(proposed.map((t) => t.id));
      addProgress('init', `Proposed ${proposed.length} topics from your papers`);
      setStep('topics');
    } catch (e) {
      if (isAbortError(e)) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('quota') || msg.includes('429')) {
        setError('OpenAlex daily quota exhausted. Add a free API key from openalex.org/settings/api for 10x the daily allowance, or try again tomorrow.');
      } else {
        setError(msg);
      }
    } finally {
      setDetailsLoading(false);
    }
  }, [addProgress]);

  const confirmTopics = useCallback((topicIds: string[]) => {
    setSelectedTopicIds(topicIds);
    setProgress([]);
    setError(null);
    setStep('build');
  }, []);

  const runBuild = useCallback(async () => {
    if (!userDetails || !subjectAuthor) return;
    setBuilding(true);
    setError(null);
    setProgress([]);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const details = userDetails;
    const articleTypes = ['article'];
    const nowYear = new Date().getFullYear();
    const startWindow = resolvedStartWindow(details.startYear, HORIZON_YEARS, nowYear);

    try {
      const client = new OpenAlexClient(details.email, details.apiKey);
      client.setProgressHandler((msg, d) => addProgress('cohort', msg, d));
      client.setAbortSignal(signal);

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
        const authors = await client.getAuthorsByTopic(tid, ['US']);
        allCandidates.push(...authors);
      }

      const uniqueCandidates = new Map<string, OpenAlexAuthor>();
      for (const a of allCandidates) {
        if (sameId(a.id, subjectAuthor.id)) continue;
        uniqueCandidates.set(shortId(a.id).toUpperCase(), a);
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
        (a.affiliations ?? []).some((aff) => aff.institution?.type === 'education'),
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
      addProgress('cohort', `Filtering for plausible start years (${startWindow[0]} to ${startWindow[1]})...`);
      const plausibleFiltered = eduFiltered.filter((a) =>
        plausibleYears(a, startWindow[0], startWindow[1]),
      );
      funnelRows.push({
        step: stepNum,
        label: 'plausible years',
        rule: `byline years could contain a start between ${startWindow[0]} and ${startWindow[1]}`,
        kept: plausibleFiltered.length,
        dropped: eduFiltered.length - plausibleFiltered.length,
      });
      addProgress('cohort', `Plausible years: ${plausibleFiltered.length}`);

      stepNum++;
      const capped = rankAndCap(plausibleFiltered, selectedTopicIds, MAX_CANDIDATES);
      const cutoff = capCutoffShare(capped, selectedTopicIds, MAX_CANDIDATES);
      if (cutoff != null) {
        funnelRows.push({
          step: stepNum,
          label: 'most on topic',
          rule: `the ${MAX_CANDIDATES} people with the largest core-topic share (effective floor ${cutoff.toFixed(2)})`,
          kept: capped.length,
          dropped: plausibleFiltered.length - capped.length,
        });
        addProgress('cohort', `Capped to the ${MAX_CANDIDATES} most on-topic candidates`, `share floor ${cutoff.toFixed(2)}`);
        stepNum++;
      }

      const cappedIds = capped.map((a) => a.id);
      addProgress('cohort', `Fetching works for ${cappedIds.length} candidates...`);
      const worksMap = await client.getWorksByAuthors(cappedIds);
      addProgress('cohort', 'Works fetched');

      addProgress('cohort', 'Estimating career starts...');
      const cohortMembers: CohortMember[] = [];
      let estimated = 0;
      for (let i = 0; i < capped.length; i++) {
        const author = capped[i];
        const works = worksMap.get(author.id) ?? [];
        const estimate = estimateStart(works, author.id, articleTypes);
        if (estimate.confidence === 'high' && estimate.year != null) {
          estimated++;
          if (estimate.year >= startWindow[0] && estimate.year <= startWindow[1]) {
            cohortMembers.push({
              authorId: author.id,
              startYear: estimate.year,
              works,
            });
          }
        }
        if (i % 50 === 0) {
          addProgress('cohort', `Estimating starts... ${i}/${capped.length}`, `${estimated} confident so far`);
        }
      }
      funnelRows.push({
        step: stepNum,
        label: 'career start estimated',
        rule: 'a confident first independent start (at least 2 led papers at one institution, with earlier trainee years elsewhere)',
        kept: estimated,
        dropped: capped.length - estimated,
      });
      stepNum++;
      funnelRows.push({
        step: stepNum,
        label: 'start in window',
        rule: `estimated start between ${startWindow[0]} and ${startWindow[1]}`,
        kept: cohortMembers.length,
        dropped: estimated - cohortMembers.length,
      });
      addProgress('cohort', `Cohort: ${cohortMembers.length} people`);

      if (cohortMembers.length < 5) {
        addProgress('cohort', `Warning: cohort has only ${cohortMembers.length} people. Quartiles may be unreliable.`);
      } else if (cohortMembers.length < 40) {
        addProgress('cohort', `Warning: cohort has ${cohortMembers.length} people. Quartiles under 40 are noisy.`);
      }

      addProgress('report', 'Computing metrics and quartiles...');
      const subfieldLabel = topics.find((t) => t.id === selectedTopicIds[0])?.name ?? 'your subfield';
      const result = buildReport({
        subjectName: subjectAuthor.display_name,
        institution: institutionName || details.university,
        startYear: details.startYear,
        clockExtension: details.clockExtensionYears,
        subjectWorks,
        subjectAuthorId: subjectAuthor.id,
        subjectInstitutionRor: institutionRor || undefined,
        cohortMembers,
        articleTypes,
        funnelRows,
        subfieldLabel,
        startWindow,
        nowYear,
      });

      if (signal.aborted) return;
      setReport(result.report);
      addProgress('report', 'Report ready.');
      setStep('report');
    } catch (e) {
      if (isAbortError(e)) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('quota') || msg.includes('429')) {
        setError('OpenAlex daily quota exhausted. Add a free API key for 10x the daily allowance, or try again tomorrow. Your progress is cached.');
      } else {
        setError(msg);
      }
    } finally {
      setBuilding(false);
    }
  }, [userDetails, subjectAuthor, institutionRor, institutionName, selectedTopicIds, topics, addProgress]);

  const loadExample = useCallback(() => {
    setReport(exampleReport);
    setStep('report');
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStep('details');
    setUserDetails(null);
    setSubjectAuthor(null);
    setInstitutionRor('');
    setInstitutionName('');
    setTopics([]);
    setSelectedTopicIds([]);
    setProgress([]);
    setReport(null);
    setError(null);
    setBuilding(false);
    setDetailsLoading(false);
  }, []);

  return {
    step,
    userDetails,
    topics,
    selectedTopicIds,
    progress,
    report,
    error,
    building,
    detailsLoading,
    submitDetails,
    confirmTopics,
    runBuild,
    loadExample,
    reset,
    setStep,
  };
}
