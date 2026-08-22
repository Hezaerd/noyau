export const composerPathListCanScrollDown = (list: HTMLElement): boolean =>
  list.scrollHeight - list.clientHeight - list.scrollTop > 1
