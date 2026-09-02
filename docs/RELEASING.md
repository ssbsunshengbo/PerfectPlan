# 发布指南

PerfectPlan 通过 GitHub Actions 的 **Release** 工作流构建 macOS 与 Windows 安装包。该工作流只能手动触发，并且始终先创建草稿 Release；只有人工检查安装包后，才在 GitHub 上点击 Publish release。

## 版本规则

一个发布版本必须在以下三个文件中完全一致：

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

运行 `pnpm version:check` 可验证一致性。发布标签为 `v` 加应用版本，例如应用版本 `0.1.0` 对应标签 `v0.1.0`。

## 发布步骤

1. 更新三个版本号、`CHANGELOG.md` 与相关文档。
2. 在本机运行 `pnpm check`；分别验证 macOS 应用和 Windows 安装包。
3. 合并到 `main` 后，前往 GitHub Actions，手动运行 **Release**。
4. 输入与版本严格匹配的标签，例如 `v0.1.0`；Beta 版本保留 `prerelease`。
5. 工作流依次构建 macOS `.app` 和 Windows `.exe`，并创建或更新同一个草稿 Release。
6. 从草稿 Release 下载两个安装包，在干净设备上安装、启动并确认本地数据不受影响后，再发布 Release。

工作流在校验、macOS 构建或 Windows 构建任一步失败时停止，草稿不会自动发布。

## macOS 签名与公证

在尚未配置 Apple 凭据时，工作流使用 ad-hoc 签名。这能改善 Apple Silicon 上从 GitHub 下载的应用的可打开性，但不会让 Gatekeeper 显示“已验证开发者”。正式发布前应配置 Apple Developer 的 **Developer ID Application** 证书和公证。

在 GitHub 仓库的 Settings → Secrets and variables → Actions 添加下列 secrets：

| Secret                       | 用途                                              |
| ---------------------------- | ------------------------------------------------- |
| `APPLE_CERTIFICATE`          | 导出的 `.p12` 证书文件的 base64 内容              |
| `APPLE_CERTIFICATE_PASSWORD` | 导出 `.p12` 时设置的密码                          |
| `KEYCHAIN_PASSWORD`          | CI 临时钥匙串密码                                 |
| `APPLE_SIGNING_IDENTITY`     | Developer ID Application 证书的完整签名身份       |
| `APPLE_ID`                   | Apple ID 邮箱                                     |
| `APPLE_PASSWORD`             | Apple ID 的 app-specific password，而不是登录密码 |
| `APPLE_TEAM_ID`              | Apple Developer Team ID                           |

证书可在 Keychain Access 中导出为 `.p12`，再转为单行 base64。不要提交证书、私钥或密码到仓库。全部变量配置后，Release 工作流会导入证书、采用正式签名并进行公证；缺少上述变量时则回退到 ad-hoc 签名。

## Windows 签名

当前工作流会构建可安装的 NSIS `.exe`，但不会假装它已经通过 Windows Authenticode 签名。未签名安装包可以运行，但从浏览器下载时可能出现 SmartScreen 警告。

正式发布前应选择证书服务（例如 EV 证书或 Azure Artifact Signing），并将其凭据保存为 GitHub Secrets。选择服务后，再为 Tauri 添加对应的 `bundle.windows.signCommand` 和工作流安装/认证步骤；不同供应商的配置并不通用，不能预先写入无效占位符。

## 发布前检查

- 所有 CI 任务为绿色；`pnpm check` 与 `pnpm version:check` 通过。
- `CHANGELOG.md` 已包含本次变更和已知限制。
- macOS 与 Windows 安装包均在干净环境完成安装和首次启动。
- 不发布包含 P0 或 P1 缺陷的版本。
- 核实 Release 仍为草稿，确认资产、版本号和说明后再发布。
