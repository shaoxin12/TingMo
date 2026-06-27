// i18n — 5-language translation dictionary

export type Locale = 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'ko';

type LocaleMap = Record<Locale, string>;

const D: Record<string, LocaleMap> = {
  // ── Navigation ─────────────────────────────────────────
  'nav.home':        { 'zh-CN': '主页',  'zh-TW': '主頁',  en: 'Home',      ja: 'ホーム',    ko: '홈' },
  'nav.dictionary':  { 'zh-CN': '词典',  'zh-TW': '詞典',  en: 'Dictionary', ja: '辞書',     ko: '사전' },
  'nav.model':       { 'zh-CN': '模型',  'zh-TW': '模型',  en: 'Model',      ja: 'モデル',   ko: '모델' },
  'nav.settings':    { 'zh-CN': '设置',  'zh-TW': '設定',  en: 'Settings',   ja: '設定',     ko: '설정' },
  'nav.about':       { 'zh-CN': '关于',  'zh-TW': '關於',  en: 'About',      ja: '情報',     ko: '정보' },

  // ── Brand ──────────────────────────────────────────────
  'brand.name': { 'zh-CN': 'TINGMO', 'zh-TW': 'TINGMO', en: 'TINGMO', ja: 'TINGMO', ko: 'TINGMO' },

  // ── Sections (unified: tag + title merged into one key) ─
  'section.history':    { 'zh-CN': '历史',  'zh-TW': '歷史',  en: 'History',   ja: '履歴',      ko: '기록' },
  'section.dictionary': { 'zh-CN': '词典',  'zh-TW': '詞典',  en: 'Dictionary', ja: '辞書',     ko: '사전' },
  'section.model':      { 'zh-CN': '模型',  'zh-TW': '模型',  en: 'Model',      ja: 'モデル',   ko: '모델' },
  'section.voice':      { 'zh-CN': '语音',  'zh-TW': '語音',  en: 'Voice',      ja: '音声',     ko: '음성' },
  'section.keybind':    { 'zh-CN': '快捷键','zh-TW': '快捷鍵',en: 'Keybinds',   ja: 'キー',     ko: '단축키' },
  'section.translate':  { 'zh-CN': '翻译',  'zh-TW': '翻譯',  en: 'Translation', ja: '翻訳',    ko: '번역' },
  'section.options':    { 'zh-CN': '选项',  'zh-TW': '選項',  en: 'Options',     ja: 'オプション', ko: '옵션' },
  'section.llm':        { 'zh-CN': 'AI 润色','zh-TW': 'AI 潤色',en: 'AI Refine', ja: 'AI 補正',  ko: 'AI 교정' },
  'section.about':      { 'zh-CN': '关于',  'zh-TW': '關於',  en: 'About',       ja: '情報',     ko: '정보' },
  'section.update':     { 'zh-CN': '更新',  'zh-TW': '更新',  en: 'Update',      ja: 'アップデート', ko: '업데이트' },

  // ── Settings: Voice ────────────────────────────────────
  'settings.voiceMode':          { 'zh-CN': '语音模式', 'zh-TW': '語音模式', en: 'Voice mode',     ja: '音声モード',  ko: '음성 모드' },
  'settings.voiceMode.local':    { 'zh-CN': '本地',     'zh-TW': '本地',     en: 'Local',          ja: 'ローカル',     ko: '로컬' },
  'settings.voiceMode.cloud':    { 'zh-CN': 'API',      'zh-TW': 'API',      en: 'API',            ja: 'API',          ko: 'API' },
  'settings.recognitionLanguage':{ 'zh-CN': '识别语言', 'zh-TW': '識別語言', en: 'Language',        ja: '認識言語',     ko: '인식 언어' },
  'settings.language.zh':        { 'zh-CN': '中文',     'zh-TW': '中文',     en: 'Chinese',        ja: '中国語',       ko: '중국어' },
  'settings.language.en':        { 'zh-CN': '英文',     'zh-TW': '英文',     en: 'English',        ja: '英語',         ko: '영어' },

  // ── Settings: Keybinds ─────────────────────────────────
  'settings.voiceInput':    { 'zh-CN': '语音输入', 'zh-TW': '語音輸入', en: 'Voice input',    ja: '音声入力',   ko: '음성 입력' },
  'settings.translateInput':{ 'zh-CN': '翻译输入', 'zh-TW': '翻譯輸入', en: 'Translate input', ja: '翻訳入力',   ko: '번역 입력' },

  // ── Settings: Translation ──────────────────────────────
  'settings.targetLanguage':       { 'zh-CN': '目标语言', 'zh-TW': '目標語言', en: 'Target language',   ja: '目標言語',     ko: '대상 언어' },
  'settings.translateEngine':      { 'zh-CN': '翻译引擎', 'zh-TW': '翻譯引擎', en: 'Engine',            ja: '翻訳エンジン', ko: '번역 엔진' },
  'settings.translateEngine.disabled':{ 'zh-CN': '未启用（需先开启 LLM 润色）', 'zh-TW': '未啟用（需先開啟 LLM 潤色）', en: 'Disabled (enable LLM refine first)', ja: '無効（LLM補正を先に有効化）', ko: '비활성화 (LLM 교정 먼저 활성화)' },
  'settings.translateIndependent':  { 'zh-CN': '独立翻译配置', 'zh-TW': '獨立翻譯配置', en: 'Separate config', ja: '個別設定', ko: '별도 설정' },
  'settings.translateApiKey':       { 'zh-CN': '翻译 API Key', 'zh-TW': '翻譯 API Key', en: 'Translate API Key', ja: '翻訳APIキー', ko: '번역 API 키' },
  'settings.translateApiKeyPlaceholder':{ 'zh-CN': '留空则复用润色 Key','zh-TW':'留空則復用潤色 Key',en:'Leave empty to reuse polish key',ja:'空で補正キーを再利用',ko:'비워두면 교정 키 재사용' },
  'settings.translateModel':        { 'zh-CN': '翻译模型',   'zh-TW': '翻譯模型',   en: 'Translate model',  ja: '翻訳モデル', ko: '번역 모델' },
  'settings.translateEndpoint':     { 'zh-CN': '翻译端点',   'zh-TW': '翻譯端點',   en: 'Endpoint',         ja: 'エンドポイント', ko: '엔드포인트' },
  'settings.translateEndpointPlaceholder':{ 'zh-CN': 'https://api.openai.com/v1','zh-TW':'https://api.openai.com/v1',en:'https://api.openai.com/v1',ja:'https://api.openai.com/v1',ko:'https://api.openai.com/v1' },

  // ── Settings: Options ──────────────────────────────────
  'settings.launchAtStartup': { 'zh-CN': '开机自启',   'zh-TW': '開機自啟',   en: 'Launch at startup',  ja: '起動時に実行', ko: '시작 시 실행' },
  'settings.muteOnRecord':    { 'zh-CN': '录音时静音', 'zh-TW': '錄音時靜音', en: 'Mute while recording', ja: '録音中ミュート', ko: '녹음 중 음소거' },
  'settings.useDictionary':   { 'zh-CN': '启用词典',   'zh-TW': '啟用詞典',   en: 'Use dictionary',      ja: '辞書を使用',     ko: '사전 사용' },
  'settings.micDevice':       { 'zh-CN': '麦克风',     'zh-TW': '麥克風',     en: 'Microphone',          ja: 'マイク',          ko: '마이크' },
  'settings.micDevice.default':{ 'zh-CN': '系统默认',   'zh-TW': '系統默認',   en: 'System default',      ja: 'システム既定',     ko: '시스템 기본값' },
  'settings.uiLanguage':      { 'zh-CN': '界面语言',   'zh-TW': '介面語言',   en: 'UI Language',         ja: '表示言語',       ko: '인터페이스 언어' },

  // ── Settings: LLM ──────────────────────────────────────
  'settings.enableRefine':         { 'zh-CN': '启用润色',     'zh-TW': '啟用潤色',     en: 'Enable refine',     ja: '補正を有効化', ko: '교정 활성화' },
  'settings.apiKey':               { 'zh-CN': 'API Key',      'zh-TW': 'API Key',      en: 'API Key',           ja: 'APIキー',       ko: 'API 키' },
  'settings.apiKeyPlaceholder':    { 'zh-CN': 'sk-...',       'zh-TW': 'sk-...',       en: 'sk-...',            ja: 'sk-...',        ko: 'sk-...' },
  'settings.model':                { 'zh-CN': '模型',         'zh-TW': '模型',         en: 'Model',             ja: 'モデル',        ko: '모델' },
  'settings.apiEndpoint':          { 'zh-CN': 'API 端点',     'zh-TW': 'API 端點',     en: 'API endpoint',      ja: 'APIエンドポイント', ko: 'API 엔드포인트' },
  'settings.apiEndpointPlaceholder':{ 'zh-CN': 'https://api.openai.com/v1','zh-TW': 'https://api.openai.com/v1', en: 'https://api.openai.com/v1', ja: 'https://api.openai.com/v1', ko: 'https://api.openai.com/v1' },

  // ── Model tab ──────────────────────────────────────────
  'model.asrSection':           { 'zh-CN': 'ASR 语音识别', 'zh-TW': 'ASR 語音識別', en: 'ASR',       ja: 'ASR音声認識',  ko: 'ASR 음성 인식' },
  'model.llmSection':           { 'zh-CN': 'LLM 大模型',     'zh-TW': 'LLM 大模型',     en: 'LLM',       ja: 'LLM大規模モデル', ko: 'LLM 대형 모델' },
  'model.asrEngine':            { 'zh-CN': 'ASR 引擎', 'zh-TW': 'ASR 引擎', en: 'ASR engine',        ja: 'ASRエンジン',   ko: 'ASR 엔진' },
  'model.asrEngineValue':       { 'zh-CN': 'SenseVoiceSmall', 'zh-TW': 'SenseVoiceSmall', en: 'SenseVoiceSmall', ja: 'SenseVoiceSmall', ko: 'SenseVoiceSmall' },
  'model.punctuationModel':     { 'zh-CN': '标点',     'zh-TW': '標點',     en: 'Punctuation',       ja: '句読点',        ko: '문장 부호' },
  'model.punctuationModelValue':{ 'zh-CN': '内置 ITN', 'zh-TW': '內置 ITN', en: 'Built-in ITN',      ja: '内蔵ITN',       ko: '내장 ITN' },
  'model.vad':                  { 'zh-CN': 'VAD',      'zh-TW': 'VAD',      en: 'VAD',               ja: 'VAD',           ko: 'VAD' },
  'model.vadValue':             { 'zh-CN': 'RMS 能量检测', 'zh-TW': 'RMS 能量檢測', en: 'RMS Energy', ja: 'RMSエネルギー', ko: 'RMS 에너지' },
  'model.inferenceFramework':   { 'zh-CN': '推理框架', 'zh-TW': '推理框架', en: 'Framework',         ja: '推論フレームワーク', ko: '추론 프레임워크' },
  'model.inferenceFrameworkValue':{'zh-CN':'ONNX Runtime','zh-TW':'ONNX Runtime',en:'ONNX Runtime',  ja:'ONNX Runtime',   ko:'ONNX Runtime' },
  'model.size':                 { 'zh-CN': '体积',     'zh-TW': '體積',     en: 'Size',              ja: 'サイズ',        ko: '크기' },
  'model.sizeValue':            { 'zh-CN': '~232 MB',  'zh-TW': '~232 MB',  en: '~232 MB',           ja: '~232 MB',       ko: '~232 MB' },
  'model.notDownloaded':    { 'zh-CN': '模型未下载',   'zh-TW': '模型未下載',   en: 'Model not downloaded', ja: 'モデル未ダウンロード', ko: '모델 미다운로드' },
  'model.download':         { 'zh-CN': '下载模型',     'zh-TW': '下載模型',     en: 'Download Model',      ja: 'モデルをダウンロード', ko: '모델 다운로드' },
  'model.downloading':      { 'zh-CN': '下载中',       'zh-TW': '下載中',       en: 'Downloading',         ja: 'ダウンロード中',       ko: '다운로드 중' },
  'model.extracting':       { 'zh-CN': '解压中',       'zh-TW': '解壓中',       en: 'Extracting',          ja: '展開中',               ko: '압축 해제 중' },
  'model.ready':            { 'zh-CN': '模型就绪',     'zh-TW': '模型就緒',     en: 'Model ready',         ja: 'モデル準備完了',       ko: '모델 준비 완료' },
  'model.error':            { 'zh-CN': '下载失败',     'zh-TW': '下載失敗',     en: 'Download failed',     ja: 'ダウンロード失敗',     ko: '다운로드 실패' },
  'model.retry':            { 'zh-CN': '重试',         'zh-TW': '重試',         en: 'Retry',               ja: '再試行',               ko: '재시도' },
  'model.checking':         { 'zh-CN': '检查中...',    'zh-TW': '檢查中...',    en: 'Checking...',         ja: '確認中...',            ko: '확인 중...' },

  // ── History tab ────────────────────────────────────────
  'history.totalDuration':  { 'zh-CN': '累计时长', 'zh-TW': '累計時長', en: 'Total duration',  ja: '累計時間',    ko: '총 시간' },
  'history.totalCharCount': { 'zh-CN': '累计字数', 'zh-TW': '累計字數', en: 'Total characters', ja: '累計文字数',  ko: '총 글자 수' },
  'history.recentRecords':  { 'zh-CN': '最近记录', 'zh-TW': '最近記錄', en: 'Recent records',   ja: '最近の記録',  ko: '최근 기록' },
  'history.clear':          { 'zh-CN': '清空',     'zh-TW': '清空',     en: 'Clear',           ja: '消去',        ko: '지우기' },
  'history.empty':          { 'zh-CN': '暂无语音输入记录', 'zh-TW': '暫無語音輸入記錄', en: 'No voice input records yet', ja: '音声入力記録なし', ko: '음성 입력 기록 없음' },
  'history.unit.seconds':   { 'zh-CN': ' 秒', 'zh-TW': ' 秒', en: 's',   ja: '秒',   ko: '초' },
  'history.unit.minutes':   { 'zh-CN': ' 分', 'zh-TW': ' 分', en: 'm',   ja: '分',   ko: '분' },
  'history.unit.characters':{ 'zh-CN': ' 字', 'zh-TW': ' 字', en: ' chars', ja: ' 文字', ko: ' 글자' },
  'history.searchPlaceholder':{ 'zh-CN': '搜索...', 'zh-TW': '搜尋...', en: 'Search...', ja: '検索...', ko: '검색...' },
  'history.copy':             { 'zh-CN': '复制',     'zh-TW': '複製',     en: 'Copy',      ja: 'コピー',  ko: '복사' },
  'history.reInsert':         { 'zh-CN': '再注入',   'zh-TW': '再注入',   en: 'Re-inject', ja: '再注入',    ko: '재주입' },
  'history.noResults':        { 'zh-CN': '无匹配结果', 'zh-TW': '無匹配結果', en: 'No results', ja: '結果なし', ko: '결과 없음' },

  // ── Dictionary tab ─────────────────────────────────────
  'dictionary.description': { 'zh-CN': '添加专业词汇、人名、品牌名等专属词汇。ASR 识别时会优先匹配，LLM 润色时也会保留不修改。', 'zh-TW': '添加專業詞彙、人名、品牌名等專屬詞彙。ASR 識別時會優先匹配，LLM 潤色時也會保留不修改。', en: 'Add proper nouns, technical terms, brand names. ASR will match them with priority, and LLM refinement will preserve them unchanged.', ja: '固有名詞、技術用語、ブランド名を追加。ASRが優先マッチングし、LLM補正時にも保持されます。', ko: '고유 명사, 기술 용어, 브랜드명을 추가하세요. ASR이 우선 매칭하고 LLM 교정 시에도 보존됩니다.' },
  'dictionary.word':            { 'zh-CN': '添加词汇', 'zh-TW': '添加詞彙', en: 'Add term', ja: '用語を追加', ko: '용어 추가' },
  'dictionary.wordPlaceholder': { 'zh-CN': '输入你想说的词，如 SQL、ChatGPT', 'zh-TW': '輸入你想說的詞，如 SQL、ChatGPT', en: 'Enter a term, e.g. SQL, Kubernetes', ja: '用語を入力（例: SQL, Kubernetes）', ko: '용어 입력 (예: SQL, Kubernetes)' },
  'dictionary.add':                    { 'zh-CN': '添加', 'zh-TW': '添加', en: 'Add',    ja: '追加',   ko: '추가' },
  'dictionary.delete':                 { 'zh-CN': '删除', 'zh-TW': '刪除', en: 'Delete', ja: '削除',   ko: '삭제' },

  // ── Hotkey recorder ────────────────────────────────────
  'hotkey.recordingTooltip':    { 'zh-CN': '请按键...',   'zh-TW': '請按鍵...',   en: 'Press keys...',  ja: 'キーを押してください...', ko: '키를 누르세요...' },
  'hotkey.clickToReset':        { 'zh-CN': '点击重新设置', 'zh-TW': '點擊重新設定', en: 'Click to rebind', ja: 'クリックで再設定',       ko: '클릭하여 재설정' },
  'hotkey.recordingPlaceholder': { 'zh-CN': '请按键...',   'zh-TW': '請按鍵...',   en: 'Press keys...',  ja: 'キーを押してください...', ko: '키를 누르세요...' },
  'hotkey.resetToDefault':      { 'zh-CN': '恢复默认',     'zh-TW': '恢復默認',     en: 'Reset',          ja: 'デフォルトに戻す',       ko: '기본값으로 재설정' },
  'hotkey.key.rightCtrl': { 'zh-CN': '右 Ctrl','zh-TW': '右 Ctrl',en: 'Right Ctrl', ja: '右 Ctrl',ko: '오른쪽 Ctrl' },
  'hotkey.key.leftCtrl':  { 'zh-CN': '左 Ctrl','zh-TW': '左 Ctrl',en: 'Left Ctrl',  ja: '左 Ctrl',ko: '왼쪽 Ctrl' },
  'hotkey.key.rightAlt':  { 'zh-CN': '右 Alt', 'zh-TW': '右 Alt', en: 'Right Alt',  ja: '右 Alt', ko: '오른쪽 Alt' },
  'hotkey.key.leftAlt':   { 'zh-CN': '左 Alt', 'zh-TW': '左 Alt', en: 'Left Alt',   ja: '左 Alt', ko: '왼쪽 Alt' },
  'hotkey.key.rightShift':{ 'zh-CN': '右 Shift','zh-TW':'右 Shift',en: 'Right Shift',ja: '右 Shift',ko:'오른쪽 Shift' },
  'hotkey.key.leftShift': { 'zh-CN': '左 Shift','zh-TW':'左 Shift',en: 'Left Shift', ja: '左 Shift',ko:'왼쪽 Shift' },
  'hotkey.key.win':       { 'zh-CN': 'Win',     'zh-TW': 'Win',      en: 'Win',        ja: 'Win',     ko: 'Win' },

  // ── Floating window status ─────────────────────────────
  'capsule.translate': { 'zh-CN': '译', 'zh-TW': '譯', en: 'T', ja: '訳', ko: '역' },

  'status.listening':   { 'zh-CN': '正在听...', 'zh-TW': '正在聽...', en: 'Listening...', ja: '聞き取り中...', ko: '듣는 중...' },
  'status.recognizing':{ 'zh-CN': '识别中',   'zh-TW': '識別中',   en: 'Recognizing...', ja: '認識中...',   ko: '인식 중...' },
  'status.refining':   { 'zh-CN': '润色中',   'zh-TW': '潤色中',   en: 'Refining...',    ja: '補正中...',   ko: '교정 중...' },
  'status.done':       { 'zh-CN': '完成',     'zh-TW': '完成',     en: 'Done',           ja: '完了',        ko: '완료' },
  'status.error':      { 'zh-CN': '失败',     'zh-TW': '失敗',     en: 'Failed',         ja: '失敗',        ko: '실패' },

  'error.asrHint':           { 'zh-CN': '识别失败，请检查模型文件或切换云端 ASR', 'zh-TW': '識別失敗，請檢查模型檔案或切換雲端 ASR', en: 'ASR failed. Check model files or switch to cloud ASR.', ja: '認識に失敗しました。モデルファイルを確認するか、クラウドASRに切り替えてください。', ko: 'ASR 실패. 모델 파일을 확인하거나 클라우드 ASR로 전환하세요.' },
  'error.micStartFailed':    { 'zh-CN': '麦克风启动失败', 'zh-TW': '麥克風啟動失敗', en: 'Microphone start failed', ja: 'マイク起動失敗', ko: '마이크 시작 실패' },
  'error.noAudioCaptured':   { 'zh-CN': '没有采集到音频，请检查麦克风权限', 'zh-TW': '沒有採集到音頻，請檢查麥克風權限', en: 'No audio captured. Please check microphone permission.', ja: '音声が取得できません。マイクの権限を確認してください。', ko: '오디오를 캡처하지 못했습니다. 마이크 권한을 확인하세요.' },

  // ── About ──────────────────────────────────────────────
  'about.appName':     { 'zh-CN': 'TingMo 听墨', 'zh-TW': 'TingMo 聽墨', en: 'TingMo 听墨', ja: 'TingMo 听墨', ko: 'TingMo 听墨' },
  'about.description': { 'zh-CN': '桌面 AI 语音输入法。按快捷键开始录音，再次按下停止，语音自动转文字注入光标位置。', 'zh-TW': '桌面 AI 語音輸入法。按快捷鍵開始錄音，再次按下停止，語音自動轉文字注入游標位置。', en: 'Desktop AI voice input. Press hotkey to record, press again to stop. Speech is converted to text and injected at cursor.', ja: 'デスクトップAI音声入力。ホットキーで録音開始、もう一度押すと停止。音声がテキストに変換されカーソル位置に注入されます。', ko: '데스크톱 AI 음성 입력. 단축키로 녹음 시작, 다시 누르면 중지. 음성이 텍스트로 변환되어 커서 위치에 입력됩니다.' },

  // ── Update ──────────────────────────────────────────
  'update.check':          { 'zh-CN': '检查更新',   'zh-TW': '檢查更新',   en: 'Check for updates',    ja: '更新を確認',          ko: '업데이트 확인' },
  'update.checking':       { 'zh-CN': '检查中...',  'zh-TW': '檢查中...',  en: 'Checking...',          ja: '確認中...',            ko: '확인 중...' },
  'update.available':      { 'zh-CN': '发现新版本', 'zh-TW': '發現新版本', en: 'Update available',     ja: '更新があります',      ko: '업데이트 있음' },
  'update.upToDate':       { 'zh-CN': '已是最新',   'zh-TW': '已是最新',   en: 'Up to date',           ja: '最新です',            ko: '최신 상태' },
  'update.download':       { 'zh-CN': '下载更新',   'zh-TW': '下載更新',   en: 'Download',             ja: 'ダウンロード',        ko: '다운로드' },
  'update.downloading':    { 'zh-CN': '下载中',     'zh-TW': '下載中',     en: 'Downloading',          ja: 'ダウンロード中',      ko: '다운로드 중' },
  'update.downloaded':     { 'zh-CN': '下载完成，点击安装', 'zh-TW': '下載完成，點擊安裝', en: 'Ready to install', ja: 'インストール準備完了', ko: '설치 준비 완료' },
  'update.install':        { 'zh-CN': '安装并重启', 'zh-TW': '安裝並重啟', en: 'Install & restart',    ja: 'インストールして再起動', ko: '설치 및 재시작' },
  'update.currentVersion': { 'zh-CN': '当前版本',   'zh-TW': '當前版本',   en: 'Version',              ja: 'バージョン',          ko: '버전' },
  'update.status':         { 'zh-CN': '状态',       'zh-TW': '狀態',       en: 'Status',               ja: 'ステータス',          ko: '상태' },
  'update.error':          { 'zh-CN': '检查失败',   'zh-TW': '檢查失敗',   en: 'Check failed',         ja: '確認失敗',            ko: '확인 실패' },

  // ── Onboarding ───────────────────────────────────────
  'onboarding.welcomeTitle':     { 'zh-CN': '欢迎使用听墨', 'zh-TW': '歡迎使用聽墨', en: 'Welcome to TingMo', ja: 'TingMoへようこそ', ko: 'TingMo에 오신 것을 환영합니다' },
  'onboarding.welcomeDesc':      { 'zh-CN': '听墨是一款桌面 AI 语音输入法。在任何应用中，按下快捷键开始说话，松开后文字自动注入光标位置。', 'zh-TW': '聽墨是一款桌面 AI 語音輸入法。在任何應用中，按下快捷鍵開始說話，鬆開後文字自動注入游標位置。', en: 'TingMo is a desktop AI voice input method. Press a hotkey, speak, and your words are automatically typed at the cursor — in any app.', ja: 'TingMoはデスクトップAI音声入力です。どのアプリでもホットキーを押して話すだけで、カーソル位置にテキストが自動入力されます。', ko: 'TingMo는 데스크톱 AI 음성 입력기입니다. 어떤 앱에서든 단축키를 누르고 말하면 커서 위치에 자동으로 텍스트가 입력됩니다.' },
  'onboarding.hotkeyTitle':      { 'zh-CN': '你的快捷键', 'zh-TW': '你的快捷鍵', en: 'Your hotkeys', ja: 'ホットキー', ko: '단축키' },
  'onboarding.hotkeyDesc':       { 'zh-CN': '以下是默认快捷键，你可以在设置中随时修改：', 'zh-TW': '以下是默認快捷鍵，你可以在設定中隨時修改：', en: 'These are the default hotkeys — you can change them anytime in settings:', ja: '以下のデフォルトホットキーは設定でいつでも変更できます：', ko: '기본 단축키입니다. 설정에서 언제든지 변경할 수 있습니다:' },
  'onboarding.voiceHotkey':      { 'zh-CN': '语音输入', 'zh-TW': '語音輸入', en: 'Voice input', ja: '音声入力', ko: '음성 입력' },
  'onboarding.translateHotkey':  { 'zh-CN': '翻译输入', 'zh-TW': '翻譯輸入', en: 'Translate', ja: '翻訳', ko: '번역' },
  'onboarding.modeTitle':        { 'zh-CN': '选择语音引擎', 'zh-TW': '選擇語音引擎', en: 'Choose engine', ja: '音声エンジンを選択', ko: '음성 엔진 선택' },
  'onboarding.modeDesc':         { 'zh-CN': '本地引擎完全离线，隐私安全；云端引擎识别更准，但需要联网和 API Key。', 'zh-TW': '本地引擎完全離線，隱私安全；雲端引擎識別更準，但需要聯網和 API Key。', en: 'Local runs fully offline for privacy. Cloud offers better accuracy but requires internet and an API key.', ja: 'ローカルは完全オフラインでプライバシー保護。クラウドは高精度ですがネット接続とAPIキーが必要です。', ko: '로컬은 완전 오프라인으로 개인정보를 보호합니다. 클라우드는 더 정확하지만 인터넷과 API 키가 필요합니다.' },
  'onboarding.local':            { 'zh-CN': '本地引擎', 'zh-TW': '本地引擎', en: 'Local', ja: 'ローカル', ko: '로컬' },
  'onboarding.localDesc':        { 'zh-CN': '离线 · 隐私 · 免费', 'zh-TW': '離線 · 隱私 · 免費', en: 'Offline · Private · Free', ja: 'オフライン · プライバシー · 無料', ko: '오프라인 · 개인정보 · 무료' },
  'onboarding.cloud':            { 'zh-CN': '云端引擎', 'zh-TW': '雲端引擎', en: 'Cloud', ja: 'クラウド', ko: '클라우드' },
  'onboarding.cloudDesc':        { 'zh-CN': '高精度 · 需联网', 'zh-TW': '高精度 · 需聯網', en: 'Accurate · Online', ja: '高精度 · オンライン', ko: '정확함 · 온라인' },
  'onboarding.back':             { 'zh-CN': '上一步', 'zh-TW': '上一步', en: 'Back', ja: '戻る', ko: '뒤로' },
  'onboarding.next':             { 'zh-CN': '下一步', 'zh-TW': '下一步', en: 'Next', ja: '次へ', ko: '다음' },
  'onboarding.skip':             { 'zh-CN': '跳过引导', 'zh-TW': '跳過引導', en: 'Skip', ja: 'スキップ', ko: '건너뛰기' },
  'onboarding.start':            { 'zh-CN': '开始使用', 'zh-TW': '開始使用', en: 'Get started', ja: '始める', ko: '시작하기' },
  'onboarding.modelTitle':      { 'zh-CN': '下载语音模型', 'zh-TW': '下載語音模型', en: 'Download voice model', ja: '音声モデルのダウンロード', ko: '음성 모델 다운로드' },
  'onboarding.modelDesc':       { 'zh-CN': '本地引擎需要一个语音模型（约 230 MB）。你可以现在下载，也可以稍后在设置中下载。', 'zh-TW': '本地引擎需要一個語音模型（約 230 MB）。你可以現在下載，也可以稍後在設定中下載。', en: 'The local engine requires a voice model (~230 MB). You can download it now or later in Settings.', ja: 'ローカルエンジンには音声モデル（約230MB）が必要です。今すぐダウンロードするか、後で設定からダウンロードできます。', ko: '로컬 엔진에는 음성 모델(약 230MB)이 필요합니다. 지금 다운로드하거나 나중에 설정에서 할 수 있습니다.' },

  // ── Overview ─────────────────────────────────────────
  'overview.loading':       { 'zh-CN': '加载中...',  'zh-TW': '載入中...',  en: 'Loading...',           ja: '読み込み中...',      ko: '로딩 중...' },
  'overview.error':         { 'zh-CN': '加载失败，请重启应用', 'zh-TW': '載入失敗，請重啟應用', en: 'Failed to load. Please restart the app.', ja: '読み込みに失敗しました。アプリを再起動してください。', ko: '로딩 실패. 앱을 다시 시작하세요.' },
  'overview.title':          { 'zh-CN': '概览',       'zh-TW': '概覽',       en: 'Overview',             ja: '概要',              ko: '개요' },
  'overview.today':          { 'zh-CN': '今日',       'zh-TW': '今日',       en: 'Today',                ja: '今日',              ko: '오늘' },
  'overview.total':          { 'zh-CN': '累计',       'zh-TW': '累計',       en: 'Total',                ja: '累計',              ko: '누계' },
  'overview.sessions':       { 'zh-CN': '次',         'zh-TW': '次',         en: 'times',                ja: '回',                ko: '회' },
  'overview.todayDuration':  { 'zh-CN': '今日时长',   'zh-TW': '今日時長',   en: 'duration',             ja: '時間',              ko: '시간' },
  'overview.todayChars':     { 'zh-CN': '今日字数',   'zh-TW': '今日字數',   en: 'chars',                ja: '文字数',            ko: '글자' },
  'overview.estimatedSaved': { 'zh-CN': '预估节省时间','zh-TW': '預估節省時間',en: 'Time saved (est.)',   ja: '推定節約時間',      ko: '예상 절약 시간' },
  'overview.minutes':        { 'zh-CN': '分钟',       'zh-TW': '分鐘',       en: 'minutes',              ja: '分',                ko: '분' },
  'overview.last7Days':      { 'zh-CN': '近 7 天',    'zh-TW': '近 7 天',    en: 'Last 7 days',          ja: '過去7日間',         ko: '최근 7일' },

  // ── Provider test button ────────────────────────────────
  'test.button':          { 'zh-CN': '测试',       'zh-TW': '測試',       en: 'Test',          ja: 'テスト',       ko: '테스트' },
  'test.testing':         { 'zh-CN': '测试中...',  'zh-TW': '測試中...',  en: 'Testing...',    ja: 'テスト中...',  ko: '테스트 중...' },
  'test.success':         { 'zh-CN': '连接成功',   'zh-TW': '連接成功',   en: 'Connected',     ja: '接続成功',     ko: '연결 성공' },
  'test.failed':          { 'zh-CN': '连接失败',   'zh-TW': '連接失敗',   en: 'Failed',        ja: '接続失敗',     ko: '연결 실패' },

  // ── Provider labels ─────────────────────────────────────
  'provider.asrService':  { 'zh-CN': '服务商',     'zh-TW': '服務商',     en: 'Provider',      ja: 'プロバイダ',   ko: '제공업체' },
  'provider.llmService':  { 'zh-CN': '服务商',     'zh-TW': '服務商',     en: 'Provider',      ja: 'プロバイダ',   ko: '제공업체' },

  // ── ASR cloud section ───────────────────────────────────
  'model.asrCloudApiKey':     { 'zh-CN': 'API Key',  'zh-TW': 'API Key',  en: 'API Key',       ja: 'APIキー',       ko: 'API 키' },
  'model.asrCloudApiKeyPlaceholder': { 'zh-CN': '请输入 API Key', 'zh-TW': '請輸入 API Key', en: 'Enter API Key', ja: 'APIキーを入力', ko: 'API 키 입력' },
};

export function translate(key: string, locale: Locale): string {
  return D[key]?.[locale] ?? key;
}
