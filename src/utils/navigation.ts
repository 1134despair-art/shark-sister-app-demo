export function backOrFallback(fallbackUrl = '/pages/shell/index', delta = 1) {
  const pages = getCurrentPages()
  if (pages.length > delta) {
    uni.navigateBack({
      delta,
      fail: () => uni.reLaunch({ url: fallbackUrl }),
    })
    return
  }

  uni.reLaunch({ url: fallbackUrl })
}
