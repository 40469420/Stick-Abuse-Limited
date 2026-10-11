/**
 * Minimal i18n — English + Simplified Chinese + Japanese.
 * Covers app chrome and the main 8K tuning cards; preview tabs
 * (Marius/Apex) stay English for now. Locale persists in localStorage.
 */
import { createContext, useContext, useState } from 'react'

export type Lang = 'en' | 'zh' | 'ja'

export const LANGS: ReadonlyArray<{ id: Lang; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: '简体中文' },
  { id: 'ja', label: '日本語' },
]

type Dict = Record<string, Record<Lang, string>>

const STR: Dict = {
  'nav.tuning': { en: 'Tuning', zh: '调校', ja: '調整' },
  'nav.sticks': { en: 'Sticks', zh: '摇杆', ja: 'スティック' },
  'nav.device': { en: 'Device', zh: '设备', ja: 'デバイス' },
  'nav.calibrate': { en: 'Calibrate', zh: '校准', ja: 'キャリブレーション' },
  'nav.data': { en: 'Data', zh: '数据', ja: 'データ' },
  'nav.profiles': { en: 'Profiles', zh: '配置', ja: 'プロファイル' },
  'nav.lab': { en: 'Lab', zh: '实验室', ja: 'ラボ' },
  'nav.export': { en: 'Export', zh: '导出', ja: 'エクスポート' },
  'nav.steam': { en: 'Steam', zh: 'Steam', ja: 'Steam' },
  'nav.preview': { en: 'Preview', zh: '预览', ja: 'プレビュー' },
  'nav.app': { en: 'App', zh: '应用', ja: 'アプリ' },
  'nav.language': { en: 'Language', zh: '语言', ja: '言語' },
  'side.rescan': { en: 'Rescan USB', zh: '重新扫描 USB', ja: 'USBを再スキャン' },
  'side.copy': { en: 'Copy diagnostics', zh: '复制诊断信息', ja: '診断情報をコピー' },
  'side.disconnect': { en: 'Disconnect', zh: '断开连接', ja: '切断' },
  'side.connected': { en: 'Connected', zh: '已连接', ja: '接続中' },
  'side.disconnected': { en: 'Disconnected', zh: '未连接', ja: '未接続' },
  'side.by': { en: 'Developed by RealKiyoshi', zh: '开发者 RealKiyoshi', ja: '開発者 RealKiyoshi' },
  'top.write': { en: 'Write to controller', zh: '写入手柄', ja: 'コントローラーに書き込む' },
  'msg.connect': { en: 'Connect a controller', zh: '连接手柄', ja: 'コントローラーを接続' },
  'msg.connectBody': { en: 'Rescan, then connect the vendor interface. Close the other tuner app first — it holds the handle.', zh: '重新扫描，然后连接厂商接口。请先关闭其他调校软件——它会占用设备。', ja: '再スキャンしてベンダーインターフェースに接続してください。他の調整アプリを先に閉じてください。' },
  'msg.loading': { en: 'Loading profile…', zh: '正在加载配置…', ja: 'プロファイル読み込み中…' },
  'msg.locked': { en: 'tuning locked', zh: '调校已锁定', ja: '調整はロック中' },
  'msg.dirty': { en: 'Unsaved stick changes — write to apply.', zh: '摇杆有未保存的更改——请写入以应用。', ja: '未保存の変更があります — 書き込んで適用。' },
  'sticks.live': { en: 'Live sticks', zh: '实时摇杆', ja: 'ライブスティック' },
  'sticks.liveHint': { en: 'Move the sticks.', zh: '推动摇杆。', ja: 'スティックを動かしてください。' },
  'sticks.deadzone': { en: 'Dead zone + anti-deadzone', zh: '死区 + 反死区', ja: 'デッドゾーン + アンチデッドゾーン' },
  'sticks.start': { en: 'Start (input below = 0)', zh: '起始（低于则为 0）', ja: '開始（以下は0）' },
  'sticks.end': { en: 'End (input above = full)', zh: '终点（高于则满）', ja: '終了（以上は最大）' },
  'sticks.antiStart': { en: 'Anti-deadzone start (output floor — snap)', zh: '反死区起点（输出下限——跟手）', ja: 'アンチ開始（出力下限）' },
  'sticks.antiEnd': { en: 'Anti-deadzone end (output ceiling)', zh: '反死区终点（输出上限）', ja: 'アンチ終了（出力上限）' },
  'sticks.factory': { en: 'Factory 5%', zh: '出厂 5%', ja: '工場出荷 5%' },
  'sticks.aimEnd': { en: 'Aim End 80%', zh: '瞄准终点 80%', ja: 'エイム終了 80%' },
  'sticks.flickEnd': { en: 'Flick End 65%', zh: '甩枪终点 65%', ja: 'フリック終了 65%' },
  'sticks.antiSnap': { en: 'Anti snap 8%', zh: '反死区跟手 8%', ja: 'アンチスナップ 8%' },
  'sticks.antiMax': { en: 'Anti max 15%', zh: '反死区最大 15%', ja: 'アンチ最大 15%' },
  'sticks.antiOff': { en: 'Anti off', zh: '关闭反死区', ja: 'アンチOFF' },
  'sticks.centerGuard': { en: 'Center guard: measure wander', zh: '中心保护：测量漂移', ja: 'センターガード：振れを測定' },
  'sticks.measuring': { en: "Measuring… don't touch", zh: '测量中…请勿触碰', ja: '測定中…触らないでください' },
  'sticks.outer': { en: 'Outer Threshold', zh: '外阈值', ja: 'アウターしきい値' },
  'sticks.noLimit': { en: 'No limit', zh: '无限制', ja: '無制限' },
  'sticks.setInfinite': { en: 'Set ∞', zh: '设为 ∞', ja: '∞に設定' },
  'sticks.curve': { en: 'Custom curve designer', zh: '自定义曲线', ja: 'カスタムカーブ' },
  'sticks.send': { en: 'Send to pad', zh: '发送到手柄', ja: 'パッドに送信' },
  'sticks.reload': { en: 'Reload from pad', zh: '从手柄重载', ja: 'パッドから再読み込み' },
  'sticks.matches': { en: 'pad matches design', zh: '与手柄一致', ja: 'パッドと一致' },
  'sticks.differs': { en: 'design ≠ pad — send it', zh: '设计≠手柄——请发送', ja: '設計≠パッド — 送信してください' },
  'sticks.addPoint': { en: '+ Add point', zh: '+ 添加点', ja: '+ ポイント追加' },
  'sticks.copyCurve': { en: 'Copy pad curve → other stick', zh: '复制手柄曲线→另一摇杆', ja: 'パッドカーブをもう一方へコピー' },
  'sticks.saveCurrent': { en: 'Save current', zh: '保存当前', ja: '現在を保存' },
  'sticks.shape': { en: 'Shape', zh: '形状', ja: '形状' },
  'sticks.round': { en: 'Round diagonals', zh: '圆形斜向', ja: 'ラウンド対角' },
  'sticks.square': { en: 'Square gate', zh: '方形档位', ja: 'スクエアゲート' },
  'sticks.raw': { en: 'Pure raw 1:1', zh: '纯原生 1:1', ja: 'ピュアRAW 1:1' },
  'sticks.reset': { en: 'Reset everything', zh: '全部重置', ja: 'すべてリセット' },
  'sticks.resetAll': { en: 'RESET EVERYTHING', zh: '全部重置', ja: 'すべてリセット' },
  'device.polling': { en: 'Polling rate', zh: '回报率', ja: 'ポーリングレート' },
  'device.bits': { en: 'Bit depth', zh: '位深', ja: 'ビット深度' },
  'device.rate': { en: 'Controller Rate', zh: '控制器速率', ja: 'コントローラーレート' },
  'cal.bench': { en: 'Calibration bench', zh: '校准台', ja: 'キャリブレーションベンチ' },
  'cal.quick': { en: 'Quick calibrate', zh: '快速校准', ja: 'クイック調整' },
  'cal.step': { en: 'Step-by-step', zh: '分步校准', ja: 'ステップ調整' },
  'cal.open': { en: 'Open session', zh: '开始会话', ja: 'セッション開始' },
  'cal.commit': { en: 'Commit', zh: '提交', ja: '確定' },
  'cal.cancel': { en: 'Cancel', zh: '取消', ja: 'キャンセル' },
  'cal.done': { en: 'Done', zh: '完成', ja: '完了' },
  'cal.sample': { en: 'Sample', zh: '采样', ja: 'サンプル' },
  'common.cancel': { en: 'Cancel', zh: '取消', ja: 'キャンセル' },
  'common.close': { en: 'Close', zh: '关闭', ja: '閉じる' },
  'common.save': { en: 'Save', zh: '保存', ja: '保存' },
  'common.apply': { en: 'Apply', zh: '应用', ja: '適用' },
  'common.delete': { en: 'Delete', zh: '删除', ja: '削除' },
  'common.reload': { en: 'Reload', zh: '重载', ja: '再読み込み' },
  'common.dismiss': { en: 'Dismiss', zh: '忽略', ja: '閉じる' },
  'common.loading': { en: 'Loading…', zh: '加载中…', ja: '読み込み中…' },
  'common.working': { en: 'Working…', zh: '处理中…', ja: '処理中…' },
  'profiles.title': { en: 'Stick profiles', zh: '摇杆配置', ja: 'スティックプロファイル' },
  'profiles.readAll': { en: 'Read all slots', zh: '读取全部槽位', ja: '全スロット読み込み' },
  'profiles.write': { en: 'Write', zh: '写入', ja: '書き込み' },
  'steam.title': { en: 'Export to Steam', zh: '导出到 Steam', ja: 'Steamへエクスポート' },
  'lang.title': { en: 'Language', zh: '语言', ja: '言語' },
  'lang.hint': { en: 'Applies immediately. Core tuning UI is translated; preview tabs stay English for now.', zh: '立即生效。核心调校界面已翻译，预览选项卡暂为英文。', ja: 'すぐに適用されます。主要UIは翻訳済み、プレビュータブは英語のままです。' },
}

export function tr(lang: Lang, key: string): string {
  return STR[key]?.[lang] ?? STR[key]?.en ?? key
}

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
}

export const LangContext = createContext<LangCtx>({ lang: 'en', setLang: () => undefined })

export function useLangState(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = window.localStorage.getItem('sticklabs.lang')
      if (saved === 'zh' || saved === 'ja' || saved === 'en') return saved
    } catch {
      /* ignore */
    }
    return 'en'
  })
  const setLang = (l: Lang): void => {
    setLangState(l)
    try {
      window.localStorage.setItem('sticklabs.lang', l)
    } catch {
      /* ignore */
    }
  }
  return [lang, setLang]
}

export function useT(): (key: string) => string {
  const { lang } = useContext(LangContext)
  return (key: string) => tr(lang, key)
}
