import React, { useState } from 'react';
import { useSettingsStore } from '../../store/settings';
import { useI18n } from '../../i18n/context';

export const DictionaryPanel: React.FC = () => {
  const { t } = useI18n();
  const { dictionary, addDictEntry, removeDictEntry } = useSettingsStore();
  const [word, setWord] = useState('');

  const handleAdd = () => {
    const w = word.trim();
    if (!w) return;
    // Check for duplicates
    if (dictionary.some((e) => e.word === w)) return;
    addDictEntry({ word: w, replace: w });
    setWord('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

  const handleDelete = (wordToDelete: string) => {
    const idx = dictionary.findIndex((e) => e.word === wordToDelete);
    if (idx !== -1) removeDictEntry(idx);
  };

  return (
    <section className="nb-section">
      <h2 className="nb-section-title">
        <span className="nb-tag accent">{t('section.dictionary')}</span>
      </h2>
      <p className="nb-about-desc" style={{ marginBottom: 10 }}>
        {t('dictionary.description')}
      </p>

      {/* Add form */}
      <div className="nb-card" style={{ marginBottom: 12 }}>
        <div className="nb-row">
          <span className="nb-label">{t('dictionary.word')}</span>
          <input
            className="nb-input"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('dictionary.wordPlaceholder')}
          />
        </div>
        <div className="nb-hr" />
        <button className="nb-btn primary" onClick={handleAdd} style={{ width: '100%' }}>
          {t('dictionary.add')}
        </button>
      </div>

      {/* Word list */}
      {dictionary.length > 0 && (
        <div className="nb-card" style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {dictionary.map((entry) => (
              <span key={entry.word} className="dict-tag">
                {entry.word}
                <button
                  onClick={() => handleDelete(entry.word)}
                  className="dict-tag-del"
                  title={t('dictionary.delete')}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
