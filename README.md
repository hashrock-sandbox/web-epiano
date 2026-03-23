# Web ePiano

ブラウザで動作するエレクトリックピアノ。[mda ePiano](https://github.com/mod-audio/mda-lv2) のDSPエンジンをWeb Audioに移植。

## 特徴

- mda ePianoのオリジナル波形データによるサンプルベース音源
- 整数補間によるサンプル再生、3段階ベロシティレイヤー
- 指数減衰エンベロープ、1次LPF（muffle）、オーバードライブ
- トレモロ/オートパンLFO、トレブルブースト
- ノート位置ベースのステレオ幅
- 11パラメータをリアルタイム調整可能なUI
- PCキーボード（A〜;キー）およびマウス/タッチで演奏

## 操作

| キー | 音 |
|------|------|
| A S D F G H J K L ; | C4 D4 E4 F4 G4 A4 B4 C5 D5 E5（白鍵） |
| W E T Y U O P | C#4 D#4 F#4 G#4 A#4 C#5 D#5（黒鍵） |

## 開発

```bash
pnpm install
pnpm dev
```

## 技術スタック

React + TypeScript + Vite

## ライセンス

音源エンジンは mda ePiano (GPL-3.0) を基にしています。
