// 根据构建产物生成 Tauri v2 更新清单（latest.json）。
// CI 各平台 job 在构建（产生 .sig）后调用本脚本，把「安装包 URL + 签名」汇总成清单，
// 再作为 Release 资产上传。客户端通过固定的 latest-{{target}}.json 端点读取。
//
// 用法：
//   node scripts/generate-updater-manifest.mjs \
//     --os windows|darwin \
//     --version 1.0.4 \
//     --release-url https://github.com/{owner}/{repo}/releases/download/v1.0.4 \
//     --installer-name cherimoya-ssh_1.0.4_x64-setup.exe \
//     --sig /path/to/installer.sig \
//     --out latest-windows.json
//
// 说明：
//   - 构建产出的 `.sig` 文件内容即清单 `signature` 字段的值（无需再 base64）。
//   - 目标 key 形如 `{os}-{arch}`（windows-x86_64 / darwin-x86_64 / darwin-aarch64）。
//   - macOS 构建 universal 二进制，运行时在 Apple Silicon 上报 darwin-aarch64、
//     在 Intel 上报 darwin-x86_64，因此两个 key 都指向同一份安装包。

import fs from "node:fs";

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith("--")) a[k.slice(2)] = argv[++i];
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const {
  os,
  version,
  "release-url": releaseUrl,
  "installer-name": installerName,
  sig,
  out,
} = args;

if (!os || !version || !releaseUrl || !installerName || !sig || !out) {
  console.error(
    "缺少参数：--os --version --release-url --installer-name --sig --out",
  );
  process.exit(1);
}

// .sig 文件内容本身就是清单 signature 字段的最终值
const signature = fs.readFileSync(sig, "utf8").trim();
const url = `${releaseUrl.replace(/\/$/, "")}/${installerName}`;

const platforms = {};
if (os === "darwin") {
  platforms["darwin-x86_64"] = { url, signature };
  platforms["darwin-aarch64"] = { url, signature };
} else {
  platforms[`${os}-x86_64`] = { url, signature };
}

const manifest = {
  version,
  notes: "通过 GitHub Release 自动发布的新版本。",
  pub_date: new Date().toISOString(),
  platforms,
};

fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
console.log(`已生成更新清单：${out}`);