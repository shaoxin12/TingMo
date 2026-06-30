// Text corrector — deterministic regex-based corrections run before LLM refinement.
// Fixes common ASR homophone errors, merges letter-by-letter spellings,
// normalizes Chinese numbers/dates/amounts, and fixes tech term casing.
// Principle: only correct when confidence is high. Never guess.

export interface CorrectionRecord {
  from: string;
  to: string;
  reason: string;
}

export interface CorrectionResult {
  corrected: string;
  changes: CorrectionRecord[];
}

export interface DictEntry {
  word: string;
  replace: string;
}

// ── Homophone Table ────────────────────────────────────────────
// Mapping from common ASR misrecognition → correct word.
// Only exact substring match; case-sensitive where applicable.

const HOMOPHONE_MAP: [string, string][] = [
  // Directory / file system
  ['跟目录', '根目录'],
  ['跟路径', '根路径'],
  ['副目录', '父目录'],
  ['子木路', '子目录'],
  ['路径跟', '路径根'],
  ['跟节点', '根节点'],

  // Code / dev
  ['代码厂', '代码仓'],
  ['代码裤', '代码库'],
  ['吉特', 'Git'],
  ['集特', 'Git'],
  ['比特仓库', 'Git 仓库'],
  ['比特分支', 'Git 分支'],
  ['比特提交', 'Git 提交'],
  ['比特合并', 'Git 合并'],
  ['破阿', 'PR'],
  ['爱术', 'issue'],
  ['普尔瑞快斯特', 'Pull Request'],
  ['偷坎', 'Token'],

  // Tech terms — homophone
  ['脱肯', 'Token'],
  ['偷肯', 'Token'],
  ['科德', 'Coder'],
  ['当普', 'Dump'],
  ['戴蒙', 'Daemon'],
  ['塞德', 'Thread'],
  ['斯莱德', 'Thread'],
  ['普西', 'px'],
  ['维爱普', 'VIP'],
  ['赛德斯', 'CIDR'],
  ['沃克', 'Walk'],
  ['斯塔克', 'Stack'],
  ['弗瑞姆', 'Frame'],

  // AI / LLM
  ['大圆模型', '大语言模型'],
  ['拉玛', 'LLaMA'],
  ['拆特 GPT', 'ChatGPT'],
  ['拆的 GPT', 'ChatGPT'],
  ['双子座', 'Gemini'],
  ['克劳德', 'Claude'],
  ['欧派', 'OpenAI'],
  ['普罗姆特', 'Prompt'],
  ['托肯', 'Token'],

  // Common
  ['命定', '命名'],
  ['电行', '典型'],
  ['反胃', '范围'],
  ['经用', '禁用'],
  ['轻用', '启用'],
  ['调佣', '调用'],
  ['还存', '缓存'],
  ['纯属', '传输'],
  ['服气', '服务器'],
  ['副武器', '服务器'],
  ['课护端', '客户端'],
  ['断口', '端口'],
  ['坚挺', '监听'],
  ['待理', '代理'],
  ['反代', '反向代理'],
  ['复在', '负载'],
  ['军亨', '均衡'],
  ['见空', '健康检查'],
  ['荣灾', '容灾'],
  ['异布', '异步'],
  ['同布', '同步'],
  ['所引', '索引'],
  ['茶寻', '查询'],
  ['茶询', '查询'],
  ['倒叙', '倒序'],
  ['降续', '降序'],
  ['声续', '升序'],
  ['排续', '排序'],
  ['过略', '过滤'],
  ['教验', '校验'],
  ['解惜', '解析'],
  ['序列花', '序列化'],
  ['反序列花', '反序列化'],
  ['电泳', '调用'],
  ['掉用', '调用'],
  ['毁掉', '回调'],
  ['毁掉函数', '回调函数'],
  ['身明', '声明'],
  ['静太', '静态'],
  ['动太', '动态'],
  ['食例', '实例'],
  ['食力', '实例'],
  ['累行', '类型'],
  ['变亮', '变量'],
  ['敞亮', '常量'],
  ['汗数', '函数'],
  ['翻法', '方法'],
  ['魔板', '模板'],
  ['摸板', '模板'],
  ['借口', '接口'],
  ['抽像', '抽象'],
  ['继程', '继承'],
  ['多肽', '多态'],

  // Docker / K8s
  ['都可', 'Docker'],
  ['都可儿', 'Docker'],
  ['都可镜像', 'Docker 镜像'],
  ['都可容器', 'Docker 容器'],
  ['都可康普斯', 'Docker Compose'],
  ['酷贝', 'Kube'],
  ['酷贝儿', 'Kube'],
  ['酷贝康特楼', 'KubeController'],
  ['酷贝耐提斯', 'Kubernetes'],
  ['K 八 S', 'K8s'],
  ['K 8 S', 'K8s'],

  // Cloud
  ['德维奥普斯', 'DevOps'],
  ['CICD', 'CI/CD'],
  ['C I C D', 'CI/CD'],

  // Config / files
  ['抗费格', 'config'],
  ['康费格', 'config'],
  ['肯费格', 'config'],
  ['抗飞鸽', 'config'],
  ['抗飞哥', 'config'],
  ['扛费格', 'config'],

  // File extensions — common spoken patterns
  ['点md', '.md'],
  ['点js', '.js'],
  ['点ts', '.ts'],
  ['点json', '.json'],
  ['点yaml', '.yaml'],
  ['点yml', '.yml'],
  ['点py', '.py'],
  ['点java', '.java'],
  ['点go', '.go'],
  ['点rs', '.rs'],
  ['点cpp', '.cpp'],
  ['点html', '.html'],
  ['点css', '.css'],
  ['点txt', '.txt'],
  ['点pdf', '.pdf'],
  ['点git', '.git'],
  ['点env', '.env'],
  ['点toml', '.toml'],
  ['点lock', '.lock'],
  ['点svg', '.svg'],
  ['点png', '.png'],
  ['点jpg', '.jpg'],
  ['点csv', '.csv'],
  ['点xml', '.xml'],
  ['点sql', '.sql'],
  ['点sh', '.sh'],
  ['点docker', '.docker'],
  ['点editor', '.editor'],
  ['点eslint', '.eslint'],
  ['点prettier', '.prettier'],
  ['点gitignore', '.gitignore'],
];

// ── Letter-merge Pattern ──────────────────────────────────────
// Single letters separated by spaces: "G P T" → "GPT", "A P I" → "API"
// Must be 2+ consecutive single ASCII letters.

// Match single letters separated by spaces, with CJK-aware boundaries.
// \b fails after CJK — use (?<=[一-鿿]|^|\s) instead.
const LETTER_MERGE_RE = /(?<=[一-鿿]|^|\s)([A-Za-z])\s+((?:[A-Za-z]\s+)*[A-Za-z])(?=[一-鿿]|$|\s)/g;

// ── Chinese Number → Arabic ────────────────────────────────────

const CN_NUM_MAP: Record<string, number> = {
  '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  '十': 10, '百': 100, '千': 1000, '万': 10000, '亿': 100000000,
};

function cnNumToArabic(cn: string): number | null {
  const cleaned = cn.replace(/^十/, '一十');
  let section = 0;   // current section (< 10000)
  let result = 0;    // total (accumulates 万+ sections)
  let pendingDigit = 0;

  for (const ch of cleaned) {
    const val = CN_NUM_MAP[ch];
    if (val === undefined) return null;
    if (val >= 10000) {
      // 万/亿 — close current section and start new one
      section += pendingDigit;
      result += (section || 1) * val;
      section = 0;
      pendingDigit = 0;
    } else if (val >= 10) {
      // 十/百/千 multiplier — pairs with preceding digit
      section += (pendingDigit || 1) * val;
      pendingDigit = 0;
    } else {
      // digit 0-9
      pendingDigit = val;
    }
  }
  section += pendingDigit;
  result += section;
  return result;
}

// Match Chinese number expressions — must be at least 2 chars OR have a unit suffix.
// Single isolated digits (一/二/三) are NOT matched — they're usually not meant as cardinals.
const CN_NUMBER_RE = /(?:百分之)?[零一二三四五六七八九十百千万亿]{2,}(?:点[零一二三四五六七八九]+)?(?:个|块|元|条|次|台|张|件|只|万|千|百)?/g;
const CN_DECIMAL_RE = /(?:百分之)?([零一二三四五六七八九十百千万亿]+)点([零一二三四五六七八九]+)/;

// ── Date Patterns ──────────────────────────────────────────────

const DATE_PATTERNS: Array<{ re: RegExp; fn: (m: RegExpMatchArray) => string }> = [
  {
    // X月Y号/日
    re: /(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]/g,
    fn: (m) => `${m[1]}月${m[2]}日`,
  },
  {
    // X年Y月Z号/日
    re: /(\d{2,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]/g,
    fn: (m) => `${m[1]}年${m[2]}月${m[3]}日`,
  },
];

// ── Money Patterns ─────────────────────────────────────────────
// Convert Chinese money expressions directly (handle both "五万块" and "50000块")
const CN_MONEY_RE = /([零一二三四五六七八九十百千万亿]+)(万|千|百)?(?:块|元)/g;
function cnMoneyToNum(cn: string): number | null {
  // Strip trailing 块/元 then convert
  const core = cn.replace(/[块元]$/, '');
  if (/^\d+$/.test(core)) return parseInt(core);
  return cnNumToArabic(core);
}

// ── Tech Term Casing ───────────────────────────────────────────
// Common tech terms that should always be uppercase/lowercase.

const TECH_CASING: Array<[RegExp, string]> = [
  [/\bapi\b/g, 'API'],
  [/\bsql\b/g, 'SQL'],
  [/\bcss\b/g, 'CSS'],
  [/\bhtml\b/g, 'HTML'],
  [/\bhttp\b(?!s)/gi, 'HTTP'],
  [/\bhttps\b/gi, 'HTTPS'],
  [/\burl\b/g, 'URL'],
  [/\bjson\b/g, 'JSON'],
  [/\bxml\b/g, 'XML'],
  [/\bcsv\b/g, 'CSV'],
  [/\byaml\b/g, 'YAML'],
  [/\bdom\b/g, 'DOM'],
  [/\bsdk\b/g, 'SDK'],
  [/\bcli\b/g, 'CLI'],
  [/\bgui\b/g, 'GUI'],
  [/\bui\b(?!\w)/g, 'UI'],
  [/\bux\b/g, 'UX'],
  [/\bcdn\b/g, 'CDN'],
  [/\bdns\b/g, 'DNS'],
  [/\btcp\b/g, 'TCP'],
  [/\budp\b/g, 'UDP'],
  [/\bip\b(?!\w)/g, 'IP'],
  [/\bssl\b/g, 'SSL'],
  [/\btls\b/g, 'TLS'],
  [/\bssh\b/g, 'SSH'],
  [/\bos\b(?!\w)/g, 'OS'],
  [/\bcpu\b/g, 'CPU'],
  [/\bgpu\b/g, 'GPU'],
  [/\bram\b/g, 'RAM'],
  [/\bssd\b/g, 'SSD'],
  [/\bhd\b(?!\w)/g, 'HD'],
  [/\bvm\b/g, 'VM'],
  [/\bci\b/g, 'CI'],
  [/\bcd\b(?!\w)/g, 'CD'],
  [/\bpr\b/g, 'PR'],
  [/\bjs\b(?!\w)/g, 'JS'],
  [/\bts\b(?!\w)/g, 'TS'],
  [/\bdb\b/g, 'DB'],
  [/\bsaas\b/gi, 'SaaS'],
  [/\bpaas\b/gi, 'PaaS'],
  [/\biaas\b/gi, 'IaaS'],
];

// ── Normalize dictionary entries ───────────────────────────────────
// Accepts both `DictEntry[]` ({word, replace}) and legacy `string[]` ("word=>replace")

function normalizeDict(dictionary?: DictEntry[] | string[]): Array<{ word: string; replace: string }> {
  if (!dictionary?.length) return [];
  if (typeof dictionary[0] === 'string') {
    return (dictionary as string[]).map(entry => {
      const [word, replace] = entry.split('=>');
      return { word: word?.trim() || '', replace: replace?.trim() || '' };
    }).filter(e => e.word && e.replace);
  }
  return dictionary as DictEntry[];
}

// ── Main Correction Function ────────────────────────────────────

export function correctText(raw: string, dictionary?: DictEntry[] | string[]): CorrectionResult {
  const changes: CorrectionRecord[] = [];
  let text = raw;

  // 1. Homophone table — exact match, longest first to prevent partial replacements
  const sorted = [...HOMOPHONE_MAP].sort((a, b) => b[0].length - a[0].length);
  for (const [wrong, correct] of sorted) {
    if (text.includes(wrong)) {
      const before = text;
      text = text.split(wrong).join(correct);
      if (text !== before) {
        changes.push({ from: wrong, to: correct, reason: 'homophone' });
      }
    }
  }

  // 1.5. Chinese "dot" before English letters → period (file extension pattern)
  // e.g. "cloud点md" → "cloud.md", "文件点js" → "文件.js"
  text = text.replace(/([一-鿿\w])点([a-zA-Z][a-zA-Z0-9]{0,10})(?![一-鿿])/g, (_full, before, ext) => {
    const result = `${before}.${ext}`;
    if (result !== _full) changes.push({ from: _full, to: result, reason: 'dot-to-period' });
    return result;
  });

  // 2. Letter merging: "G P T" → "GPT"
  text = text.replace(LETTER_MERGE_RE, (_full, first, rest) => {
    const merged = first + rest.replace(/\s+/g, '');
    if (merged.length >= 2 && merged.length <= 10) {
      changes.push({ from: _full, to: merged, reason: 'letter-merge' });
      return merged;
    }
    return _full;
  });

  // 3. Chinese number → Arabic
  text = text.replace(CN_NUMBER_RE, (match) => {
    // Handle percentages
    const pctMatch = match.match(/^百分之(.+)/);
    const core = pctMatch ? pctMatch[1] : match;

    const decimalMatch = core.match(CN_DECIMAL_RE);
    if (decimalMatch) {
      const intPart = cnNumToArabic(decimalMatch[1]);
      const decDigits = decimalMatch[2].split('').map(ch => CN_NUM_MAP[ch]).join('');
      if (intPart !== null) {
        const result = pctMatch ? `${intPart}.${decDigits}%` : `${intPart}.${decDigits}`;
        changes.push({ from: match, to: result, reason: 'cn-num' });
        return result;
      }
    }

    const num = cnNumToArabic(core);
    if (num !== null) {
      let result: string;
      if (pctMatch) {
        result = `${num}%`;
      } else {
        result = String(num);
      }
      if (result !== match) {
        changes.push({ from: match, to: result, reason: 'cn-num' });
        return result;
      }
    }
    return match;
  });

  // 4. Chinese money expressions: "五万块" → "50000元"
  text = text.replace(CN_MONEY_RE, (match) => {
    const num = cnMoneyToNum(match);
    if (num !== null) {
      const result = `${num}元`;
      changes.push({ from: match, to: result, reason: 'money' });
      return result;
    }
    return match;
  });

  // 5. Date normalization
  for (const { re, fn } of DATE_PATTERNS) {
    text = text.replace(re, (...args) => {
      const m = args as unknown as RegExpMatchArray;
      const result = fn(m);
      if (result !== m[0]) changes.push({ from: m[0], to: result, reason: 'date' });
      return result;
    });
  }

  // 6. Tech term casing
  for (const [re, replacement] of TECH_CASING) {
    const before = text;
    text = text.replace(re, replacement);
    if (text !== before) {
      const match = before.match(re);
      if (match) changes.push({ from: match[0], to: replacement, reason: 'casing' });
    }
  }

  // 7. User dictionary — exact match, highest priority (last so it overrides everything)
  const dict = normalizeDict(dictionary);
  if (dict.length > 0) {
    for (const { word, replace } of dict) {
      if (text.includes(word)) {
        text = text.split(word).join(replace);
        changes.push({ from: word, to: replace, reason: 'dictionary' });
      }
    }
  }

  return { corrected: text, changes };
}
