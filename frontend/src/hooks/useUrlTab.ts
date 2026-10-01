import { useSearchParams } from 'react-router-dom'

export interface TabDef<T extends string> {
  value: T
  label: string
}

// The active tab lives in the URL (?tab=...), so a reload or a shared link lands on the same tab;
// an unknown/missing value falls back to the first tab. Used with components/TabBar.tsx.
export function useUrlTab<T extends string>(tabs: TabDef<T>[]): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const active = (tabs.find((t) => t.value === requested)?.value ?? tabs[0].value) as T
  return [active, (next: T) => setParams({ tab: next }, { replace: true })]
}
