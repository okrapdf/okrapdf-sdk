import type { OverlayRenderProps } from '@okrapdf/plugin-types';

interface ProgressOverlayProps extends OverlayRenderProps {
  title?: string;
}

export function ExtractionProgressOverlay({
  isRunning,
  progress,
  onCancel,
  title = 'Extracting Text',
}: ProgressOverlayProps) {
  if (!isRunning) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">📄</div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">
            Processing page {progress.current} of {progress.total}
          </p>
        </div>

        <div className="mb-4">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 text-center mt-1">
            {progress.percentage}%
          </p>
        </div>

        <button
          onClick={onCancel}
          className="w-full py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
