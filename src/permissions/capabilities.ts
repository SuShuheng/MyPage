import type { CapabilityId } from "../persistence/settings-types";

export type CapabilityRisk = "low" | "high";

export interface CapabilityDefinition {
  id: CapabilityId;
  name: string;
  description: string;
  risk: CapabilityRisk;
  desktopOnly: boolean;
}

export const CAPABILITIES: Record<CapabilityId, CapabilityDefinition> = {
  "vault.read": {
    id: "vault.read",
    name: "读取 Vault",
    description: "读取用户授权文件夹内的文件。",
    risk: "low",
    desktopOnly: false,
  },
  "vault.write": {
    id: "vault.write",
    name: "写入 Vault",
    description: "修改用户授权文件夹内的文件。",
    risk: "high",
    desktopOnly: false,
  },
  "network.request": {
    id: "network.request",
    name: "网络请求",
    description: "请求用户授权的协议、域名和端口。",
    risk: "low",
    desktopOnly: false,
  },
  "externalFs.read": {
    id: "externalFs.read",
    name: "读取外部目录",
    description: "读取 Vault 之外的授权目录。",
    risk: "high",
    desktopOnly: true,
  },
  "externalFs.write": {
    id: "externalFs.write",
    name: "写入外部目录",
    description: "修改 Vault 之外的授权目录。",
    risk: "high",
    desktopOnly: true,
  },
  "git.read": {
    id: "git.read",
    name: "读取 Git 仓库",
    description: "读取授权仓库的状态、历史与差异。",
    risk: "high",
    desktopOnly: true,
  },
  "git.write": {
    id: "git.write",
    name: "写入 Git 仓库",
    description: "在授权仓库执行明确的 Git 写入操作。",
    risk: "high",
    desktopOnly: true,
  },
  "obsidian.command": {
    id: "obsidian.command",
    name: "运行 Obsidian 命令",
    description: "运行用户授权的具体命令。",
    risk: "high",
    desktopOnly: false,
  },
  "system.exec": {
    id: "system.exec",
    name: "运行系统程序",
    description: "运行用户授权的程序和参数模板。",
    risk: "high",
    desktopOnly: true,
  },
};

export function isHighRiskCapability(capability: CapabilityId): boolean {
  return CAPABILITIES[capability].risk === "high";
}
