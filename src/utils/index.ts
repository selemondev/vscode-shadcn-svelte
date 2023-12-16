export const to = async <T>(promise: Promise<T>) => {
    try {
      const res = await promise;
      return [res, null] as const;
    } catch (error) {
      return [null, error] as const;
    }
  };
  