import { t, locale } from '../i18n';
import { useEffect, useState } from 'react';
import { openExternalUrl } from '../platform/openExternalUrl';
import { wikiJson } from './service';

interface Standing { name?: string; min_reputation?: number | null; }
interface Mission {
  uuid: string; game_version: string; title: string; description?: string;
  mission_giver?: string; faction?: { name?: string }; legality_label?: string;
  reputation_prerequisite?: { faction?: string; scope?: string; min_standing?: Standing | null; max_standing?: Standing | null } | null;
  prerequisite_groups?: { required_count?: number; required_tags?: { name: string }[]; excluded_tags?: { name: string }[]; missions?: { title: string }[] }[];
  min_crime_stat?: number | null; max_crime_stat?: number | null;
  not_for_release?: boolean; work_in_progress?: boolean;
}
export function missionId(url: string | undefined): string | null {
  try {
    const parsed = new URL(url || '');
    if (parsed.origin !== 'https://api.star-citizen.wiki') return null;
    return parsed.pathname.match(/^\/missions\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\/?$/i)?.[1] || null;
  } catch { return null; }
}
export function standingText(s: Standing | null | undefined): string {
  if (!s) return t("Not supplied");
  return `${s.name || t("Unnamed standing")}${typeof s.min_reputation === 'number' ? t(" (rank begins at {{v0}} reputation)", { v0: s.min_reputation.toLocaleString(locale()) }) : ''}`;
}
function readCache(key: string): Mission | null {
  try { const data = JSON.parse(localStorage.getItem(key) || 'null'); return data && typeof data.title === 'string' ? data : null; } catch { return null; }
}
export function MissionDetails({ url, version }: { url?: string; version: string }) {
  const id = missionId(url);
  const [open, setOpen] = useState(false);
  return id ? <details onToggle={e => setOpen(e.currentTarget.open)}><summary>{t("Faction, reputation & prerequisites")}</summary>{open && <MissionContent key={`${version}:${id}`} id={id} version={version} />}</details> : <p>{t("Faction and reputation details are not supplied for this mission.")}</p>;
}
function MissionContent({ id, version }: { id: string; version: string }) {
  const key = `sc-companion:mission-acquisition:v1:${version}:${id}`;
  const [mission, setMission] = useState(() => readCache(key));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    wikiJson(`/missions/${id}?version=${encodeURIComponent(version)}`, controller.signal).then(response => {
      if (controller.signal.aborted) return;
      const data: Mission = response.data;
      if (!data || data.uuid !== id || data.game_version !== version || typeof data.title !== 'string') throw new Error(t("Mission data did not match this game version."));
      // Keep only acquisition fields, not large spawn and reward-pool payloads.
      const normalized: Mission = { uuid: id, game_version: version, title: data.title, description: data.description, mission_giver: data.mission_giver, faction: data.faction && { name: data.faction.name }, legality_label: data.legality_label, reputation_prerequisite: data.reputation_prerequisite, prerequisite_groups: data.prerequisite_groups, min_crime_stat: data.min_crime_stat, max_crime_stat: data.max_crime_stat, not_for_release: data.not_for_release, work_in_progress: data.work_in_progress };
      setMission(normalized);
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('sc-companion:mission-acquisition:v1:'));
        if (keys.length >= 20 && !keys.includes(key)) localStorage.removeItem(keys[0]);
        localStorage.setItem(key, JSON.stringify(normalized));
      } catch { /* A full cache must not prevent reading mission details. */ }
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : t("Mission details unavailable.")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, version, key, retry]);
  const source = `https://api.star-citizen.wiki/missions/${id}?version=${encodeURIComponent(version)}`;
  return <div className="bp-mission">
    {loading && <p role="status">{t("Loading mission requirements...")}</p>}
    {error && <p role="alert">{error}{mission ? t(" Showing cached mission data.") : ''} <button onClick={() => setRetry(n => n + 1)}>{t("Retry")}</button></p>}
    {mission && <>
      <dl><dt>{t("Faction")}</dt><dd>{mission.faction?.name || t("Not supplied")}</dd><dt>{t("Mission giver")}</dt><dd>{mission.mission_giver || t("Not supplied")}</dd><dt>{t("Legality")}</dt><dd>{mission.legality_label || t("Not supplied")}</dd>
      <dt>{t("Required reputation")}</dt><dd>{mission.reputation_prerequisite ? <>{mission.reputation_prerequisite.faction || mission.faction?.name || t("Faction not supplied")}<br />{t("Minimum standing:")} {standingText(mission.reputation_prerequisite.min_standing)}{mission.reputation_prerequisite.max_standing && <><br />{t("Highest eligible standing:")} {standingText(mission.reputation_prerequisite.max_standing)}</>}</> : t("Not supplied; this does not establish that no reputation is required.")}</dd>
      {(mission.min_crime_stat != null || mission.max_crime_stat != null) && <><dt>{t("CrimeStat limits")}</dt><dd>{t("Minimum:")} {mission.min_crime_stat ?? t("Not supplied")}{t("; maximum:")} {mission.max_crime_stat ?? t("Not supplied")}</dd></>}
      </dl>
      {(mission.not_for_release || mission.work_in_progress) && <p className="bp-error">{t("The source marks this mission as unreleased or work in progress.")}</p>}
      <h5>{t("Prerequisites")}</h5>{mission.prerequisite_groups?.length ? mission.prerequisite_groups.map((g, i) => <div key={i}><p>{t("Required tags")}{g.required_count != null ? t(" ({{v0}} required)", { v0: g.required_count }) : ''}: {g.required_tags?.map(t => t.name).join(', ') || t("Not supplied")}</p>{!!g.excluded_tags?.length && <p>{t("Excluded tags:")} {g.excluded_tags.map(t => t.name).join(', ')}</p>}{!!g.missions?.length && <><p>{t("Linked prerequisite missions:")}</p><ul>{g.missions.map((m, j) => <li key={j}>{m.title}</li>)}</ul></>}</div>) : <p>{t("No prerequisite chain supplied.")}</p>}
      {mission.description && <details><summary>{t("Mission briefing")}</summary><p className="bp-briefing">{new DOMParser().parseFromString(mission.description, 'text/html').body.textContent}</p></details>}
    </>}
    <a href={source} target="_blank" rel="noreferrer" onClick={e => { if (window.__TAURI_INTERNALS__) { e.preventDefault(); void openExternalUrl(source).catch(() => setError(t("Could not open mission source."))); } }}>{t("Open mission on Star Citizen Wiki")}</a>
  </div>;
}
