import React, { useCallback } from 'react';
import { Joyride, EventData, EVENTS, STATUS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';

interface TourGuideProps {
  steps: Step[];
  run: boolean;
  onFinish: () => void;
  onStep?: (stepIndex: number) => void;
}

export function TourGuide({ steps, run, onFinish, onStep }: TourGuideProps) {
  const { t } = useTranslation();
  const handleEvent = useCallback((data: EventData) => {
    if (data.type === EVENTS.STEP_BEFORE && onStep) {
      onStep(data.index);
    }
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      onFinish();
    }
  }, [onFinish, onStep]);

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      onEvent={handleEvent}
      options={{
        buttons: ['back', 'close', 'primary', 'skip'],
        showProgress: true,
        primaryColor: '#4f46e5',
        zIndex: 10000,
        arrowColor: '#fff',
        backgroundColor: '#fff',
        overlayColor: 'rgba(0, 0, 0, 0.5)',
        textColor: '#374151',
      }}
      locale={{
        back: t('tour.buttons.back'),
        close: t('tour.buttons.close'),
        last: t('tour.buttons.last'),
        next: t('tour.buttons.next'),
        nextWithProgress: t('tour.buttons.nextWithProgress'),
        skip: t('tour.buttons.skip'),
      }}
      styles={{
        buttonPrimary: {
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
