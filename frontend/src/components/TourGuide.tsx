import React, { useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';

interface TourGuideProps {
  steps: Step[];
  run: boolean;
  onFinish: () => void;
}

export function TourGuide({ steps, run, onFinish }: TourGuideProps) {
  const handleCallback = useCallback((data: CallBackProps) => {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      onFinish();
    }
  }, [onFinish]);

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showSkipButton
      showProgress
      disableScrolling={false}
      callback={handleCallback}
      styles={{
        options: {
          primaryColor: '#4f46e5',
          zIndex: 10000,
          arrowColor: '#fff',
          backgroundColor: '#fff',
          overlayColor: 'rgba(0, 0, 0, 0.5)',
          textColor: '#374151',
          spotlightShadow: '0 0 15px rgba(0, 0, 0, 0.5)',
        },
        buttonNext: {
          backgroundColor: '#4f46e5',
          borderRadius: '6px',
          fontSize: '14px',
        },
        buttonBack: {
          color: '#4f46e5',
          fontSize: '14px',
        },
        buttonSkip: {
          color: '#6b7280',
          fontSize: '13px',
        },
        tooltip: {
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
        },
        tooltipTitle: {
          fontSize: '16px',
          fontWeight: 600,
          color: '#1f2937',
        },
        tooltipContent: {
          fontSize: '14px',
          color: '#374151',
          lineHeight: 1.6,
        },
      }}
    />
  );
}
