# G2 Recall

[English README](README.md)

**Even G2スマートグラスでAnkiのカードを復習する、オープンソースの暗記アプリです。**

スマートフォン側でAnkiの`.apkg`ファイルを読み込み、学習するファイルやデッキを選びます。その後はEven G2上で問題と答えを確認し、ジェスチャーで「Again / Hard / Good / Easy」を選んで復習できます。

## できること

- Ankiの`.apkg`ファイルを読み込む
- 複数のファイルやデッキから学習対象を選ぶ
- 日本語と英語を切り替える
- Even G2上で問題、答え、次回間隔を確認する
- 復習状態をEven Hub内にローカル保存する

## 現在の制限

G2 RecallはAnki本体の完全な代替ではありません。現在はBasic、反転Basic、Clozeなどの一般的なカードを軽量な形式で読み込みます。

- AnkiWeb同期には対応していません
- Ankiアドオンは実行できません
- 複雑なカスタムテンプレートは簡略化されます
- カードの画像や音声はG2表示用には対応していません

## 使ってみる

現在のEven Hubアプリはテスト用のPrivate buildとして配布しています。

1. Even Hubの開発者ポータルでこのプロジェクトを開く
2. `evenhub/dist/g2-recall.ehpk`をPrivate buildとしてアップロードする
3. Even Realitiesアプリの`Even Hub > Me > Apps > Private builds`からインストールする
4. スマートフォン側で`.apkg`を読み込み、Even G2で復習を開始する

GitHubリポジトリ自体はPublicですが、Even Hubの一般公開アプリ一覧にはまだ掲載されていません。

## 開発者向け

```bash
cd evenhub
npm install
npm run build
npm run pack
```

詳細な機能、ジェスチャー、スクリーンショット、ライセンスは[英語README](README.md)を参照してください。

## ライセンス

G2 Recall本体はMIT Licenseです。同梱ライブラリのライセンスは[第三者ライセンス一覧](THIRD_PARTY_NOTICES.md)に記載しています。
