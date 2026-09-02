export function sourcePath(value) {
  return value ? `./sync-grid/${value.replace(/^\.\//, '')}` : '';
}
