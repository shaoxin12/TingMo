import React, { useEffect, useState, useCallback } from 'react';
import { useI18n } from '../../i18n/context';
import { NbSelect } from './NbSelect';

interface Props {
  value: string;
  onChange: (deviceId: string) => void;
}

export const MicDevicePicker: React.FC<Props> = ({ value, onChange }) => {
  const { t } = useI18n();
  const [devices, setDevices] = useState<Array<{ deviceId: string; label: string }>>([]);

  const refreshDevices = useCallback(() => {
    navigator.mediaDevices?.enumerateDevices().then((devs) => {
      const inputs = devs
        .filter((d) => d.kind === 'audioinput' && d.deviceId)
        .map((d) => ({ deviceId: d.deviceId, label: d.label || t('settings.micDevice.default') + ' ' + d.deviceId.slice(0, 8) }));
      if (inputs.length > 0) setDevices(inputs);
    }).catch(() => {});
  }, [t]);

  useEffect(() => {
    refreshDevices();
    // Listen for hardware changes (plug/unplug)
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices);
    };
  }, [refreshDevices]);

  if (devices.length < 2) return null;

  const options = [
    { value: '', label: t('settings.micDevice.default') },
    ...devices.map((d) => ({ value: d.deviceId, label: d.label })),
  ];

  return (
    <NbSelect value={value} options={options} onChange={onChange} />
  );
};
