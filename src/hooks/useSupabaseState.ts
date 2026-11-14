import { usePreviewState } from '../preview/storage';
// Local transport compatibility adapter for the baseline screens.
export function useSupabaseState<T>(key: string, initialValue: T) {
 const [value, set] = usePreviewState(key, initialValue);
 return [value, set, true, set] as const;
}
