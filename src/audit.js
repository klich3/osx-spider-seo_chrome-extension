// Heuristics over the selected rendered page, not Google ranking guarantees.
export function auditPage(page) {
  const seo = page.seo || {};
  const issues = [];
  const add = (id, severity, message) => issues.push({id, severity, message});
  if (!seo.title?.trim()) add('title-missing', 'error', 'Page title is missing.');
  else if (seo.title.length > 60) add('title-long', 'notice', `Title has ${seo.title.length} characters; preview its display length.`);
  if (seo.titleCount > 1) add('title-multiple', 'error', 'Multiple title elements are present.');
  if (!seo.description?.trim()) add('description-missing', 'warning', 'Meta description is missing.');
  else if (seo.description.length > 155) add('description-long', 'notice', `Meta description has ${seo.description.length} characters; preview its display length.`);
  if (seo.descriptionCount > 1) add('description-multiple', 'warning', 'Multiple meta descriptions are present.');
  if (!seo.canonical) add('canonical-missing', 'notice', 'No canonical link is declared.');
  if (seo.canonicalCount > 1) add('canonical-multiple', 'error', 'Multiple canonical links are declared.');
  if (seo.robots?.some(value => /(?:^|[\s,:])(?:noindex|none)(?:$|[\s,])/i.test(value))) add('noindex', 'notice', 'Rendered meta robots declares noindex/none; verify this is intended.');
  if (!seo.h1?.length) add('h1-missing', 'warning', 'No H1 heading was found.');
  else if (seo.h1.length > 1) add('h1-multiple', 'notice', 'Multiple H1 headings: review the page outline.');
  if (!seo.lang) add('lang-missing', 'warning', 'The HTML language is not declared.');
  if (!seo.viewport) add('viewport-missing', 'warning', 'No viewport meta tag was found.');
  if (seo.images?.missingAlt) add('images-missing-alt', 'warning', `${seo.images.missingAlt} images have no alt attribute. Decorative images may use empty alt.`);
  if (seo.images?.missingDimensions) add('images-missing-dimensions', 'notice', `${seo.images.missingDimensions} images lack width/height attributes; check whether CSS reserves their space.`);
  if (seo.linkSummary?.blankWithoutNoopener) add('links-blank', 'notice', `${seo.linkSummary.blankWithoutNoopener} target=_blank links have no explicit noopener/noreferrer (modern Chrome provides implicit noopener).`);
  if (seo.structuredData?.errors) add('jsonld-invalid', 'error', `${seo.structuredData.errors} JSON-LD blocks could not be parsed.`);
  if (seo.structuredData?.skipped) add('jsonld-skipped', 'notice', `${seo.structuredData.skipped} JSON-LD blocks exceeded the inspection limit.`);
  return {issues, counts: Object.fromEntries(['error','warning','notice'].map(kind => [kind,issues.filter(i => i.severity === kind).length])),
    note:'Rendered DOM heuristics only. Character lengths are preview guidance; no ranking or indexability verdict is inferred.'};
}
