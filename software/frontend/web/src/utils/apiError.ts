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
    return 'Backend request timed out. Check that the backend API is running and REACT_APP_API_URL is correct.';
  }

  if (!maybeError?.response && maybeError?.message === 'Network Error') {
    return 'Backend is not reachable. Check that the backend API is running and REACT_APP_API_URL is correct.';
  }

  if (!maybeError?.response && maybeError?.message) {
    return maybeError.message;
  }

  return fallback;
};
