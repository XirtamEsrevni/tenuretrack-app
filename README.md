<p align="center">
  <img src="https://github.com/sp8rks/tenuretrack/raw/main/src/tenuretrack/assets/tenuretrack-logo.png" alt="tenuretrack" width="340">
</p>

# tenuretrack App

**Nobody tells assistant professors the numbers. This app helps compute them.**

This is an app-ification of the original [Professor Taylor Sparcks' tenuretrack notebook](https://github.com/sp8rks/tenuretrack).

Give the app your ORCID, institution, and faculty start year. It uses open data from [OpenAlex](https://openalex.org/) to build an aggregated comparison cohort of early-career faculty in your subfield, then shows how your publication record compares at the same point in the tenure clock.

## What it provides

- Publication, lead-author, citation, h-index, and venue norms by career year.
- Cohort percentiles and a report designed to give context—not a tenure threshold.
- Aggregate-only outputs: no rankings or per-person cohort tables.
- A transparent view of cohort filters, data limitations, and privacy considerations.

## Important context

This project is descriptive, not prescriptive. It cannot measure important parts of academic work such as teaching, mentoring, service, funding, software, datasets, or public scholarship. OpenAlex data can also contain incomplete author profiles, affiliations, and author-position signals.

## Data and privacy

- Your OpenAlex contact email and API key are used to access OpenAlex according to its API requirements.
- Local caches may contain OpenAlex responses, including author names; keep them private and do not commit them.
- Generated reports are intended to contain aggregate cohort statistics only.

## Original project

For the original browser-based notebook, methodology, full cohort-building details, and citations, see [sp8rks/tenuretrack](https://github.com/sp8rks/tenuretrack). The underlying project recommends a free [OpenAlex API key](https://openalex.org/settings/api) to make cohort construction substantially faster.

## License

MIT. Cohort data comes from OpenAlex under CC0.
