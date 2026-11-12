// Retain the workload settings of the November backup, without putting a
// user's identifiers, selectors, memo text or credentials in a test profile.
module.exports = function syntheticProfileBackup(raw) {
  const source = raw?.storage?.sync, device = raw?.storage?.local;
  if (!source || !device) throw Error('A DCB v8 storage backup is required.');
  const sync = {}, local = {};
  for (const [key,value] of Object.entries(source)) {
    if (/^(?:extensionpay_|.*(?:token|password|credential|secret))/i.test(key)) continue;
    if (typeof value === 'boolean' || typeof value === 'number') sync[key] = value;
  }
  for (const key of ['blockMode','quickBlockButtonPosition','userBlockTriggerMode','dcbFontFamily']) {
    if (typeof source[key] === 'string') sync[key] = source[key];
  }
  for (const key of ['blockedIds','blockedKeywords','hiddenKeywords','removeSelectors','removeSelectorsGall','removeSelectorsSearch']) {
    if (Array.isArray(source[key])) sync[key] = source[key].map((_,i) =>
      key.startsWith('removeSelectors') ? '.fixture-hidden-'+i : 'fixture'+key.toLowerCase()+i);
  }
  for (const key of ['dcbImageBlockConfig','dcbImageAccountRules','keywordBlockTargets','keywordHideTargets','keywordBlockCategories','keywordHideCategories','dcbTextDetection']) {
    if (source[key]) sync[key] = Object.fromEntries(Object.entries(source[key]).filter(([field,v]) =>
      typeof v === 'boolean' || typeof v === 'number' || ['activityMatchMode','sensitivity'].includes(field)));
  }
  sync.dcbFontCustomFamily = '';
  local.userMemos = Object.fromEntries(Object.keys(device.userMemos || {}).map((_,i) =>
    ['uid:fixture'+i, {uid:'fixture'+i,memo:'합성'+i,color:'#336699'}]));
  local.blockedUids = (device.blockedUids || []).map((_,i) => 'fixtureblocked'+i);
  local.dcbDcconBlockState = {};
  local.dcbImageBlockRecords = {};
  local.dcbImageBlockAuthorTargets = {};
  if (sync.dcbImageBlockConfig) local.dcbImageBlockConfig = sync.dcbImageBlockConfig;
  for (const key of ['quickBlockButtonPosition','quickBlockButtonPositionSavedAt']) {
    if (key in device) local[key] = device[key];
  }
  return {version:8,storage:{sync,local}};
};
