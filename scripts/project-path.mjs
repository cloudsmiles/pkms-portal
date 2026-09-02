import { resolve } from 'node:path';

/** 返回数据源项目目录，默认指向 portal 下的 Sync-Grid 子模块。 */
export function getProjectDir({ portalDir, env = process.env } = {}) {
  const configuredDir = env.SYNC_GRID_DIR?.trim();
  return configuredDir ? resolve(configuredDir) : resolve(portalDir, 'sync-grid');
}
