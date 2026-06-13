export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const maybeError = error as {
    code?: string;
    message?: string;
    response?: {
      data?: unknown;
    };
  };

  const responseData = maybeError?.response?.data;
  if (typeof responseData === 'string' && responseData.trim()) {
    return responseData.trim();
  }

  if (responseData && typeof responseData === 'object' && 'message' in responseData) {
    const message = (responseData as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }

  if (maybeError?.code === 'ECONNABORTED') {
    return 'The server took too long to respond. Check your internet connection and try again.';
  }

  if (!maybeError?.response && maybeError?.message === 'Network Error') {
    return 'Cannot reach the Spectron server. Check your internet connection and try again.';
  }

  if (!maybeError?.response && maybeError?.code === 'ERR_NETWORK') {
    return maybeError.message || 'Cannot reach the Spectron server. Check your internet connection and try again.';
  }

  if (!maybeError?.response && maybeError?.message) {
    return maybeError.message;
  }

  return fallback;
};
