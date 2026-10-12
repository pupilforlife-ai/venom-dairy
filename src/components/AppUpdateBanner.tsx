import { useEffect, useState } from 'react';

const UPDATE_EVENT = 'vejoy:update-available';

export default function AppUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(
    () => document.documentElement.dataset.vejoyUpdateAvailable === 'true',
  );

  useEffect(() => {
    const showUpdate = () => setUpdateAvailable(true);
    window.addEventListener(UPDATE_EVENT, showUpdate);
    return () => window.removeEventListener(UPDATE_EVENT, showUpdate);
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[100] border-b border-amber-300 bg-amber-50 px-4 py-3 shadow-lg">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-950">A newer version of Vejoy is ready.</p>
          <p className="text-xs text-amber-800">Finish and save the current entry, then reload to use the latest fixes and reports.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800"
          >
            Reload updated app
          </button>
          <button
            type="button"
            onClick={() => setUpdateAvailable(false)}
            className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Continue for now
          </button>
        </div>
      </div>
    </div>
  );
}
