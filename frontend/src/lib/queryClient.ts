import { QueryClient, MutationCache, QueryCache } from "@tanstack/react-query";
import { toast } from "@/design-system/components/toast";

function extractMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  return undefined;
}

function showError(error: unknown) {
  toast({
    variant: "destructive",
    title: "Request failed",
    description: extractMessage(error) ?? "Something went wrong",
  });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: showError,
  }),
  mutationCache: new MutationCache({
    onError: showError,
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
