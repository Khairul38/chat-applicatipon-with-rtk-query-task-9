import { apiSlice } from "../api/apiSlice";
import io from "socket.io-client";

export const messagesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMessages: builder.query({
      query: (id) =>
        `/messages?conversationId=${id}&_sort=timestamp&_order=desc&_page=1&_limit=${process.env.REACT_APP_MESSAGES_PER_PAGE}`,
      transformResponse(apiResponse, meta) {
        const totalCount = meta.response.headers.get("X-Total-Count");
        return {
          data: apiResponse,
          totalCount,
        };
      },
      async onCacheEntryAdded(
        arg,
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved }
      ) {
        // create socket
        const socket = io("http://localhost:9000", {
          reconnectionDelay: 1000,
          reconnection: true,
          reconnectionAttemps: 10,
          transports: ["websocket"],
          agent: false,
          upgrade: false,
          rejectUnauthorized: false,
        });
        try {
          await cacheDataLoaded;
          socket.on("message", (data) => {
            console.log(data);
            updateCachedData((draft) => {
              console.log(JSON.stringify(draft));

              if (arg == data?.data?.conversationId) {
                draft.data.push(data?.data);
              }
              // const conversation = draft.find(
              //   (c) => c.id == data?.data?.id
              // );

              // if (conversation?.id) {
              //   conversation.message = data?.data?.message;
              //   conversation.timestamp = data?.data?.timestamp;
              // } else {
              //   draft.push(data?.data);
              // }
            });
          });
        } catch (error) {}
        await cacheEntryRemoved;
        socket.close();
      },
    }),
    getMoreMessages: builder.query({
      query: ({ id, page }) =>
        `/messages?conversationId=${id}&_sort=timestamp&_order=desc&_page=${page}&_limit=${process.env.REACT_APP_MESSAGES_PER_PAGE}`,
      async onQueryStarted(arg, { queryFulfilled, dispatch }) {
        try {
          const messages = await queryFulfilled;
          console.log(messages);
          if (messages?.data?.length > 0) {
            // update messages cache pessimistically start
            console.log(arg.id);
            dispatch(
              apiSlice.util.updateQueryData(
                "getMessages",
                arg.id.toString(),
                (draft) => {
                  return {
                    data: [...draft.data, ...messages.data],
                    totalCount: Number(draft.totalCount),
                  };
                }
              )
            );

            // update messages cache pessimistically end
          }
        } catch (error) {
          // patchResult.undo();
        }
      },
    }),
    addMessage: builder.mutation({
      query: (data) => ({
        url: "/messages",
        method: "POST",
        body: data,
      }),
    }),
  }),
});

export const { useGetMessagesQuery, useAddMessageMutation } = messagesApi;
