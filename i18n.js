'use strict';
/* ことばカード - 画面の文言（日本語） */
// 画面の文字はここにまとめてある（t('キー') で取り出す）。
const LANGS = [{ id: 'ja', label: '日本語', html: 'ja', speech: 'ja' }];

const I18N = {
  ja: {
    'app.name': 'ことばカード',
    'side.add': '＋ 単語を追加', 'side.search': '単語・意味を検索', 'side.settings': '⚙ 設定・データ', 'side.total': '登録 {n} 語', 'sep': '・',
    'side.lang': '表示言語',
    'filter.all': 'すべて', 'status.none': '未評価', 'status.no': '分からない', 'status.some': '少しわかる', 'status.yes': '分かる',
    'list.note.order': '登録順：新しく登録した単語が上', 'list.note.hard': '分からない順：「分からない」を押した回数が多い順',
    'list.note.efficient': '忘れかけた順：覚えている見込みが低い単語から（前回の判定・同じ判定の回数・経過日数で計算。未評価は最後）', 'list.note.random': 'ランダム：毎回ランダムな順番', 'list.note.alpha': 'アルファベット順：A→Z（大文字・小文字は区別しない）',
    'list.empty.eff': '単語がありません。', 'list.empty.filter': '条件に合う単語がありません。',
    'list.empty.none': 'まだ単語がありません。<br>「＋ 単語を追加」から登録しましょう。',
    'mode.aria': '出題モード', 'mode.order': '登録順', 'mode.random': 'ランダム', 'mode.hard': '分からない順', 'mode.efficient': '忘れかけた順', 'mode.alpha': 'アルファベット順',
    'accent.title': '発音の声', 'accent.uk': '英国・女性', 'accent.us': '米国・男性',
    'accent.uk.long': 'イギリス英語・女性', 'accent.us.long': 'アメリカ英語・男性', 'accent.uk.pack': '英語（イギリス）', 'accent.us.pack': '英語（米国）',
    'hide.title': '目隠し（Hキーで切り替え）', 'hide.label': '目隠し',
    'hide.none': 'オフ', 'hide.word': '単語の訳', 'hide.ja': '全和訳', 'hide.all': '全部',
    'hide.none.t': '目隠しなし', 'hide.word.t': '大きく表示された単語の和訳だけを隠す', 'hide.ja.t': '例文の和訳も含めてすべての和訳を隠す', 'hide.all.t': '意味・例文などの答えを全部隠す',
    'toast.hide.none': '目隠し：オフ', 'toast.hide.word': '目隠し：単語の和訳だけ隠す（クリックで表示）',
    'toast.hide.ja': '目隠し：例文も含めて和訳をすべて隠す（クリックで表示）', 'toast.hide.all': '目隠し：答えを全部隠す',
    'reshuffle': '↻ 並べ直す', 'reshuffle.t': '出題順を作り直す', 'toast.reshuffled': '出題順を作り直しました',
    'nav.prev': '前へ（←）', 'nav.next': '次へ（→）',
    'play.t': '自動再生（P）', 'play.start': '自動再生', 'play.stop': '停止',
    'player.content': '読み上げ', 'content.w': '単語だけ', 'content.m': '意味だけ', 'content.e': '例文だけ', 'content.wm': '単語＋意味', 'content.we': '単語＋例文', 'content.we.t': '自分の例文と関連する例文を読みます', 'content.all': '全部',
    'player.speed': '速度', 'player.gap': '間隔', 'gap.s': '{n}秒', 'player.loop': 'くり返す',
    'edit.add': '単語を追加', 'edit.edit': '単語を編集', 'f.word': '単語', 'f.meaning': '意味', 'f.required': '必須',
    'f.ex': '例文', 'f.exja': '例文の訳', 'f.note': 'メモ',
    'ph.word': '例）postpone', 'ph.meaning': '例）延期する', 'ph.ex': '例）The meeting was postponed until Friday.',
    'ph.exja': '例）会議は金曜日まで延期された。', 'ph.note': '品詞・言い換え・覚え方など',
    'edit.keep': '続けて追加する', 'cancel': 'キャンセル', 'save': '保存',
    'set.title': '設定・データ', 'set.voice': '発音', 'set.en': '英語の発音', 'test': '試聴', 'set.mvoice': '意味の読み上げの声',
    'set.display': '表示・操作', 'set.lang': '表示言語', 'set.theme': '背景の色', 'set.size': '文字の大きさ', 'set.blindAlpha': '目隠しの透明度', 'set.blindAlpha.hint': '0％で完全に隠れます。数字が大きいほど下の和訳がうっすら透けて見えます（既定は3％・0〜20％を1％単位で調整）。', 'toast.blindAlpha': '目隠しの透明度：{v}%',
    'set.size.hint': '選ぶとすぐに画面全体の文字・ボタンの大きさが変わります（Ctrl＋＋／Ctrl＋－でも変更できます）。',
    'opt.autoNext': '理解度ボタンを押したら次の単語へ進む', 'opt.autoSpeak': '単語を表示したら自動で発音する',
    'opt.related': '関連する例文を自動で探して表示する（最大2文・ネット接続不要）',
    'opt.general': 'TOEIC例文が足りない単語は、一般例文で補う（「一般」と表示）',
    'opt.ime': '単語の追加・編集で、日本語入力を自動で切り替える（単語・例文＝半角英数、意味・訳・メモ＝ひらがな）',
    'opt.dict': '入力した意味の下に、辞書の意味（品詞つき）を小さく表示する', 'dict.web': '検索情報', 'dict.head': '「{w}」の意味', 'dict.parts': '単語ごとの意味',
    'opt.ipa': '1単語だけの登録は、発音記号をインターネットで調べて表示する（英・米）',
    'opt.web': 'どちらにもない単語は、インターネットで例文を検索する（「検索情報」と表示）',
    'set.related.hint': 'TOEIC形式の例文（約3,300文・ビジネス場面）を優先して表示します。一般例文は <a href="https://tatoeba.org" target="_blank">Tatoeba</a>（CC BY 2.0 FR）の約14万文で、まれに誤りがあります。ネット検索では、単語だけを無料のサービス（Tatoeba・Wikinews・Free Dictionary API・Wiktionary・Wikipedia）に送信して英語の用例を取得します（和訳はTatoebaの文のみ）。',
    'set.data': 'データ', 'set.data.where': '保存場所：',
    'set.data.hint': 'アプリを新しい版に入れ替えても、このフォルダのデータはそのまま使われます。毎日の自動バックアップ（14日分）もここに保存されます。',
    'set.import': 'インポート（JSON / CSV）', 'set.exportJson': 'バックアップを書き出す（JSON）', 'set.exportCsv': 'CSVで書き出す', 'set.openFolder': '保存フォルダを開く',
    'set.csv.hint': 'CSVの列順：単語, 意味, 例文, 例文の訳, メモ（1行目が見出しでもOK。Excelやスプレッドシートで作れます）',
    'set.reset': '理解度の記録をすべてリセット', 'set.keys.title': 'ショートカット',
    'set.keys': '← → 前後の単語　／　Space 発音　／　Enter 答えを見る　／　1・2・3 理解度　／　H 目隠しの切り替え（オフ→単語の訳→全和訳→全部）　／　P 自動再生　／　N 追加　／　E 編集',
    'close': '閉じる',
    'theme.sky': '空色', 'theme.aqua': '水色', 'theme.lavender': '藤色', 'theme.mist': '白・グレー', 'theme.cream': 'クリーム', 'theme.sakura': '桜色', 'theme.rose': 'くすみピンク',
    'zoom.0.8': '極小', 'zoom.0.9': '小', 'zoom.1': '普通', 'zoom.1.15': '大', 'zoom.1.3': '極大', 'toast.zoom': '文字の大きさ：{l}',
    'card.empty.title': '表示できる単語がありません',
    'card.empty.eff': '検索に合う単語がありません。<br>検索欄の文字を消すと、すべての単語から出題します。',
    'card.empty.filter': '絞り込みや検索の条件を変えてみてください。',
    'card.welcome.title': 'ようこそ！', 'card.welcome.body': '覚えたい単語を登録して、暗記をはじめましょう。<br>CSVでまとめて取り込むこともできます（設定・データ）。',
    'card.welcome.btn': '＋ 最初の単語を追加',
    'card.views': '確認 {n} 回', 'card.dueNow': '復習どき', 'card.dueIn': '次の復習 {n}日後', 'card.nextTip': '分からない：半日／少しわかる：1→2→4→8日…／分かる：3→7.5→19→47日…（同じ判定が続くほど間隔がのびます）', 'card.unseen': '未確認', 'card.speak': '発音（Space）', 'card.speakEx': '例文を発音',
    'card.reveal': '答えを見る', 'card.revealHint': 'Enter キーでも表示できます', 'card.edit': '✎ 編集', 'card.delete': '削除',
    'blind': 'クリックで表示',
    'ipa.uk': '英', 'ipa.us': '米', 'ipa.t': '発音記号（インターネットで検索）',
    'rel.none.title': '関連する例文は見つかりませんでした',
    'rel.none.offline': 'インターネットに接続できなかったため、ネット検索はできませんでした。接続後に自動で再検索します。',
    'rel.none.notfound': 'インターネットでも見つかりませんでした。',
    'rel.none.general': '「設定・データ」で一般例文での補いをオンにすると見つかる場合があります。',
    'rel.none.own': '自分で例文を登録すると、カードに表示されます。', 'rel.none.btn': '✎ 例文を登録する',
    'rel.head': '関連する例文', 'rel.cands': '候補 {n} 文', 'rel.refresh': '例文を更新', 'rel.nomore': 'ほかの候補はありません',
    'rel.one': 'この例文を別の例文に変える', 'rel.speak': '発音', 'toast.relNoMore': 'この単語の例文は、これ以上ありません',
    'src.general': '一般', 'src.general.t': 'Tatoebaの一般例文（まれに誤りがあります）', 'src.web': '検索情報', 'src.web.t': '{s}から自動取得した例文',
    'rel.source': '出典：{s}', 'rel.noTrans': '（和訳なし）', 'internet': 'インターネット',
    'toast.saveFail': '保存に失敗しました', 'toast.noPlay': '再生できる単語がありません', 'toast.saved': '保存しました',
    'toast.added': '「{w}」を追加しました', 'toast.addedDup': '「{w}」を追加しました（同じ単語が既にあります）',
    'del.title': '単語を削除', 'del.msg': '「{w}」を削除しますか？\nこの操作は元に戻せません。', 'del.ok': '削除する', 'toast.deleted': '削除しました',
    'voice.none': '（見つかりません）', 'voice.loading': '音声を読み込み中、または英語の音声が見つかりません。', 'voice.using': '使用中の声：{v}',
    'voice.fallback': '「{a}」の声がこのPCに入っていないため、代わりに「{v}」を使っています。Windowsの「設定 → 時刻と言語 → 音声 → 音声の追加」で「{p}」を追加し、アプリを再起動すると切り替わります。',
    'voice.nothing': 'なし',
    'voice.mMissing': '{l}の音声が見つかりません（意味は表示のみになります）。Windowsの「設定 → 時刻と言語 → 音声 → 音声の追加」で「{l}」を追加し、アプリを再起動してください。',
    'voice.langName': '日本語', 'voice.test': '会議はまもなく始まります。',
    'toast.accentSub': '「{a}」の声がこのPCにないため、{v}で読み上げます（設定・データ →「発音」で追加方法を確認できます）',
    'voice.region.gb': 'イギリス英語', 'voice.region.us': 'アメリカ英語', 'voice.region.au': 'オーストラリア英語', 'voice.region.in': 'インド英語', 'voice.region.en': '英語',
    'voice.female': '女性', 'voice.male': '男性',
    'toast.oneFail': '新形式の音声で読み上げできませんでした（従来の音声だけで続けます）',
    'toast.accentMissing': '{a}の声が見つかりません（設定・データで確認できます）',
    'import.title': 'バックアップの読み込み', 'import.msg': '「{f}」には {n} 語あります。\nどのように読み込みますか？',
    'import.merge': '今の単語に追加', 'import.replace': 'すべて置き換え', 'toast.loaded': '{n} 語を読み込みました',
    'toast.readFail': 'ファイルを読み込めませんでした', 'toast.importAdded': '{n} 語を追加しました', 'toast.importSkipped': '（重複 {n} 語はスキップ）',
    'toast.exported': '書き出しました',
    'csv.head': '単語,意味,例文,例文の訳,メモ,理解度,確認回数',
    'reset.title': '理解度のリセット', 'reset.msg': 'すべての単語の理解度と確認回数を消去します。\n単語そのものは残ります。よろしいですか？',
    'reset.ok': 'リセットする', 'toast.reset': 'リセットしました',
    'dialog.export': 'エクスポート', 'dialog.import': 'インポート', 'dialog.filter': '単語データ (JSON / CSV / TSV / TXT)',
    'browserStore': '(ブラウザ保存)', 'toast.lang': '表示言語：日本語'
  }
};

// 初回起動時のサンプル単語（意味・例文の訳は表示言語に合わせる）
const SAMPLE_WORDS = [
  ['postpone', 'The board meeting has been postponed until next Monday.'],
  ['reimburse', 'Employees will be reimbursed for travel expenses.'],
  ['itinerary', 'Please check the attached itinerary before your trip.'],
  ['inventory', 'We need to take inventory at the end of the month.'],
  ['tentative', 'The tentative schedule will be finalized next week.'],
  ['commute', 'Her daily commute takes about forty minutes.'],
  ['comply with', 'All staff must comply with the new safety regulations.'],
  ['in advance', 'Please register in advance to secure a seat.'],
  ['outstanding', 'The outstanding balance must be paid by Friday.'],
  ['subsidiary', 'The company opened a subsidiary in Bangkok.']
];
const SAMPLE_TR = {
  ja: [['延期する', '取締役会は来週の月曜日まで延期された。'], ['払い戻す、返済する', '社員は出張費を払い戻される。'], ['旅程表', '出発前に添付の旅程表をご確認ください。'],
    ['在庫、在庫目録', '月末に棚卸しをする必要がある。'], ['仮の、暫定的な', '仮のスケジュールは来週確定する。'], ['通勤する；通勤', '彼女の毎日の通勤は約40分かかる。'],
    ['〜に従う、〜を順守する', '全スタッフは新しい安全規則に従わなければならない。'], ['前もって、事前に', '席を確保するため事前に登録してください。'],
    ['未払いの；際立った', '未払い残高は金曜日までに支払う必要がある。'], ['子会社', 'その会社はバンコクに子会社を開設した。']]
};

let CUR_LANG = 'ja';
function t(key, vars) {
  let s = (I18N[CUR_LANG] && I18N[CUR_LANG][key]) ?? I18N.ja[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return s;
}
// data-i18n 属性を持つ要素に訳文を入れる
function applyI18nDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  const L = LANGS.find(x => x.id === CUR_LANG) || LANGS[0];
  document.documentElement.lang = L.html;
  document.documentElement.dataset.lang = CUR_LANG;
  document.title = t('app.name');
}
