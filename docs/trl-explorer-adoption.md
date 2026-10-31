# TRL Explorer 知見の導入記録 — Inventory OS

調査基準日：2026-10-31  
TRL調査対象：`ConsulenteIdealistas/TRL` `3d9144f32dc32fff582696c46bf1688c8e4640ba`  
参照資料：`TRL_Development_Handoff_COMPLETE_20261031.md` / `TRL_Explorer_reverse_engineering_report_20261031.md`

## 位置づけ
TRL Explorerは公開情報を収集・正規化・評価・保留・保存・公開する**バッチ型研究分析基盤**。Inventory OSは**認証が必要なリアルタイム業務システム**である。参考にするのはデータ境界、状態・履歴、検証、失敗分類、CIと実際の配備の照合であり、Python／SQLite／GitHub PagesやAI採点そのものは移植しない。TRLコードの直接複製は行っていない。

## 現行システムとの比較と採否
| TRLの学び | Inventory OS の現状（コード確認） | 判断／施策 |
|---|---|---|
| 安定ID・正規化 | Item(JAN)とInventoryInstance(ロット・期限・場所)を分離、input-normalizationあり | 既存設計を維持。今後のOCR/CSVには原本・インポート単位キーを追加 |
| 正本と表示データの分離 | PostgreSQL/PrismaとAPI、画面表示を分離 | 採用。削除は通常の業務ビューからの論理削除。履歴・取引は残す |
| 出力先ごとの権限 | 一覧にはログイン確認がある一方、商品詳細GETは元々認証欠落 | 商品詳細GETにログインと削除済みデータの管理者認可を実装 |
| 状態と業務操作の区別 | 旧「廃止」・物理DELETE・一括論理DELETEが混在 | 表示名を「削除済み」に統一し、個別在庫／個別商品／一括商品の削除を履歴保持方式に変更。DBには互換性のため従来フィールド・状態値を維持 |
| 原因と復旧の区別 | APIごとにエラーコード・説明が異なる | 未完。認証切れ／データ競合／業務制約／通信失敗の共通エラー契約を次期課題 |
| 再送・並行処理対策 | 一部トランザクションと更新日時での競合検出あり | 採用中。重要な書込APIすべてで冪等キーと同時更新テストを広げる |
| 監査証跡 | AdminActionLogと在庫履歴モデルあり | 個別／一括削除に操作ログ。旧互換APIは監査の原子性を追加レビュー |
| 定期データ処理・AI | TRLと異なるオンライン運用 | バッチ基盤やAIスコアは移植しない。OCR/AI機能追加時のみ承認・根拠を設計 |
| CIと配備の分離 | VercelのGit連携、VitestとNext build | GitHub反映＝本番検収ではない。コミットSHA・READY・実機スモークを別々に記録 |
| UI／アクセシビリティ | React UI、IME考慮とレスポンシブ指定あり | 仕様だけで十分とは判断しない。320～1440px、iOS/Android/PC、キーボード、200%拡大を要検証 |

## 2026-10-31 今回の実装（コード反映）
- `src/app/api/items/[id]/route.ts`: 商品詳細GETのサーバー側認可、削除済み商品を一般ユーザーに404、単品の論理削除。
- `src/app/api/items/search/route.ts`: 商品検索APIの未認証閲覧を拒否。
- `src/app/api/inventory/route.ts`: 個別在庫DELETEを履歴保存する論理削除に統一。
- `src/repositories/ItemRepository.ts`: 通常一覧と検索で削除済み在庫明細を除外、旧APIの物理削除を論理削除へ統一。
- `src/app/api/items/route.ts`: 旧APIの「削除済み」表現と操作ログ名を整合。
- `src/app/api/items/bulk/route.ts`: 一括論理削除の事前診断、管理者による復元、監査ログ。
- `src/app/items/[id]/page.tsx`、`src/features/items/ItemTable.tsx`、`src/components/inventory/InventoryLifecycle.tsx`: 操作説明の統一、管理者復元導線、削除済みラベル。
- `src/app/api/system/version/route.ts`: ログイン後、デプロイのGitコミットSHAを非キャッシュのメタデータとして取得。
- `tests/inspection-bulk.test.ts`、`tests/item-detail-privacy.test.ts`、`tests/soft-delete-api.test.ts`、`tests/item-search-access.test.ts`、`tests/build-version.test.ts`: 削除・復元・再送・認可・リリース版照合の回帰テスト。

## 次に優先する受入・監査（この文書作成時点で未検証）
**P0**
- [ ] 最新コミットのVitest、型チェック、Nextビルド、Vercel本番READYとコミット一致。
- [ ] 実DBで商品削除→通常検索・新規棚卸から除外→管理者表示→復元、在庫履歴不変を検証。
- [ ] 既存棚卸セッションの削除後の表示・確定動作、期限・フリマ・履歴ページの横断検証。
- [ ] 旧APIを含む全書込の監査記録が更新と同一トランザクションで原子的に残ることの検証。
- [ ] ログアウト・アカウント切替時のキャッシュと、直接APIの権限越境を検証。
- [ ] DBバックアップからの復元をテスト環境で確認。

**P1**
- [ ] スマホ・タブレット・PCの320/360/390/430/768/1024/1440px表示、200%ズーム・長文・IME・キーボードのみ検証。
- [ ] JAN再読取・同時送信・通信切断時の冪等性、エラーからの復旧導線。
- [ ] APIエラーを権限不足・未発見・競合・内部障害・通信失敗で統一。
- [ ] 追加した版情報APIを使いCI・本番のGitコミットID一致を実環境でスモークテストし、必要なら管理者UIに版表示を追加する。

## リリースゲート
**実装済み**≠**テスト通過**≠**本番反映**≠**実機検収**。各段階を別々に証明し、未確認を完了扱いしない。

検証記録欄：  
- 対象コミット：最新の `master` SHA と照合  
- 自動テスト：結果・実行ログを記載  
- Vercel状態／対象SHA：記載  
- 本番スモーク（ログイン、検索、削除、復元、棚卸）：記載  
- 実機幅／利用ロール：記載  
- ロールバック：必要時は該当変更をレビューの上Git revert。DBスキーマ変更は本改修に含まない

## 出典
- https://github.com/ConsulenteIdealistas/TRL
- https://consulenteidealistas.github.io/TRL/index.html
- TRL Explorerリバースエンジニアリング報告書（2026-10-31）
- TRL開発知見・完全引き継ぎマスター（2026-10-31）

> 原典の検証範囲と推論を区別すること。TRLのテスト成功はInventory OSの品質を保証しない。
