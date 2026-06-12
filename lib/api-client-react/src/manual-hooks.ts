/**
 * Hand-written React Query hooks for endpoints added after the last orval
 * code-gen run: replies, participants, and public reply submission.
 *
 * Pattern mirrors the generated hooks exactly so they're drop-in compatible.
 */
import {
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import type {
  MutationFunction,
  QueryFunction,
  QueryKey,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ErrorType, BodyType } from "./custom-fetch";
import type { Participant, ParticipantDetail, Reply, ImportResult } from "./generated/api.schemas";

type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

// ── List replies for a block ──────────────────────────────────────────────────

export const getListRepliesUrl = (seq: number) => `/api/blocks/${seq}/replies`;
export const getListRepliesQueryKey = (seq: number) =>
  [`/api/blocks/${seq}/replies`] as const;

export const listReplies = async (
  seq: number,
  options?: RequestInit,
): Promise<Reply[]> =>
  customFetch<Reply[]>(getListRepliesUrl(seq), { ...options, method: "GET" });

export function useListReplies<
  TData = Awaited<ReturnType<typeof listReplies>>,
  TError = ErrorType<unknown>,
>(
  seq: number,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listReplies>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getListRepliesQueryKey(seq);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof listReplies>>> = ({
    signal,
  }) => listReplies(seq, { signal, ...requestOptions });
  const query = useQuery({
    queryKey,
    queryFn,
    enabled: seq >= 0,
    ...queryOptions,
  }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey };
}

// ── Submit a reply (public miner submission) ──────────────────────────────────

export interface SubmitReplyInput {
  handle: string;
  xPostUrl?: string;
  replyText?: string;
  miningKeyHash?: string;
  followersCount?: number;
  verified?: boolean;
  accountAgeDays?: number;
}

export const getSubmitReplyUrl = (seq: number) => `/api/blocks/${seq}/replies`;

export const submitReply = async (
  seq: number,
  data: SubmitReplyInput,
  options?: RequestInit,
): Promise<Reply> =>
  customFetch<Reply>(getSubmitReplyUrl(seq), {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });

export type SubmitReplyMutationVars = { seq: number; data: BodyType<SubmitReplyInput> };

export const getSubmitReplyMutationOptions = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof submitReply>>,
      TError,
      SubmitReplyMutationVars,
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof submitReply>>,
  TError,
  SubmitReplyMutationVars,
  TContext
> => {
  const mutationKey = ["submitReply"];
  const { mutation: mutationOptions, request: requestOptions } =
    options?.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...(options?.mutation ?? {}), mutationKey } };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof submitReply>>,
    SubmitReplyMutationVars
  > = ({ seq, data }) => submitReply(seq, data, requestOptions);

  return { mutationFn, ...mutationOptions };
};

export type SubmitReplyMutationResult = NonNullable<Awaited<ReturnType<typeof submitReply>>>;
export type SubmitReplyMutationError = ErrorType<unknown>;

export const useSubmitReply = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof submitReply>>,
      TError,
      SubmitReplyMutationVars,
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof submitReply>>,
  TError,
  SubmitReplyMutationVars,
  TContext
> => useMutation(getSubmitReplyMutationOptions(options));

// ── List participants ─────────────────────────────────────────────────────────

export const getListParticipantsUrl = () => `/api/participants`;
export const getListParticipantsQueryKey = () => [`/api/participants`] as const;

export const listParticipants = async (
  options?: RequestInit,
): Promise<Participant[]> =>
  customFetch<Participant[]>(getListParticipantsUrl(), {
    ...options,
    method: "GET",
  });

export function useListParticipants<
  TData = Awaited<ReturnType<typeof listParticipants>>,
  TError = ErrorType<unknown>,
>(
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof listParticipants>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getListParticipantsQueryKey();
  const queryFn: QueryFunction<Awaited<ReturnType<typeof listParticipants>>> = ({
    signal,
  }) => listParticipants({ signal, ...requestOptions });
  const query = useQuery({
    queryKey,
    queryFn,
    ...queryOptions,
  }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey };
}

// ── Get participant by handle ─────────────────────────────────────────────────

export const getGetParticipantUrl = (handle: string) =>
  `/api/participants/${handle}`;
export const getGetParticipantQueryKey = (handle: string) =>
  [`/api/participants/${handle}`] as const;

export const getParticipant = async (
  handle: string,
  options?: RequestInit,
): Promise<ParticipantDetail> =>
  customFetch<ParticipantDetail>(getGetParticipantUrl(handle), {
    ...options,
    method: "GET",
  });

export function useGetParticipant<
  TData = Awaited<ReturnType<typeof getParticipant>>,
  TError = ErrorType<unknown>,
>(
  handle: string,
  options?: {
    query?: UseQueryOptions<
      Awaited<ReturnType<typeof getParticipant>>,
      TError,
      TData
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getGetParticipantQueryKey(handle);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getParticipant>>> = ({
    signal,
  }) => getParticipant(handle, { signal, ...requestOptions });
  const query = useQuery({
    queryKey,
    queryFn,
    enabled: !!handle,
    ...queryOptions,
  }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey };
}

// ── Sync recent posts (admin utility) ─────────────────────────────────────────

export interface SyncRecentPostsInput {
  username: string;
  limit?: number;
}

export const getSyncRecentPostsUrl = () => `/api/admin/sync-recent-posts`;

export const syncRecentPosts = async (
  data: SyncRecentPostsInput,
  options?: RequestInit,
): Promise<ImportResult> =>
  customFetch<ImportResult>(getSyncRecentPostsUrl(), {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });

export type SyncRecentPostsMutationVars = { data: BodyType<SyncRecentPostsInput> };

export const getSyncRecentPostsMutationOptions = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof syncRecentPosts>>,
      TError,
      SyncRecentPostsMutationVars,
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationOptions<
  Awaited<ReturnType<typeof syncRecentPosts>>,
  TError,
  SyncRecentPostsMutationVars,
  TContext
> => {
  const mutationKey = ["syncRecentPosts"];
  const { mutation: mutationOptions, request: requestOptions } =
    options?.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...(options?.mutation ?? {}), mutationKey } };

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof syncRecentPosts>>,
    SyncRecentPostsMutationVars
  > = ({ data }) => syncRecentPosts(data, requestOptions);

  return { mutationFn, ...mutationOptions };
};

export type SyncRecentPostsMutationResult = NonNullable<Awaited<ReturnType<typeof syncRecentPosts>>>;
export type SyncRecentPostsMutationError = ErrorType<unknown>;

export const useSyncRecentPosts = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof syncRecentPosts>>,
      TError,
      SyncRecentPostsMutationVars,
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof syncRecentPosts>>,
  TError,
  SyncRecentPostsMutationVars,
  TContext
> => useMutation(getSyncRecentPostsMutationOptions(options));

