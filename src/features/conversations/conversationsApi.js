import { apiSlice } from "../api/apiSlice";
import { messagesApi } from "../messages/messagesApi";
import io from "socket.io-client";

export const conversationsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getConversations: builder.query({
      query: (email) =>
        `/conversations?participants_like=${email}&_sort=timestamp&_order=desc&_page=1&_limit=${process.env.REACT_APP_CONVERSATION_PER_PAGE}`,
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
        const socket = io("https://fake-auth-api-json-server.onrender.com", {
          reconnectionDelay: 1000,
          reconnection: true,
          reconnectionAttempts: 10,
          transports: ["websocket"],
          agent: false,
          upgrade: false,
          rejectUnauthorized: false,
        });
        try {
          await cacheDataLoaded;
          socket.on("conversation", (data) => {
            // console.log(data);
            updateCachedData((draft) => {
              // console.log(JSON.stringify(draft?.data));
              const conversation = draft?.data.find(
                (c) => c.id == data?.data?.id
              );

              if (conversation?.id) {
                conversation.message = data?.data?.message;
                conversation.timestamp = data?.data?.timestamp;
              } else if (data?.data?.participants.includes(arg)) {
                draft?.data.unshift(data?.data);
              }
            });
          });
        } catch (error) {}
        await cacheEntryRemoved;
        socket.close();
      },
    }),
    getMoreConversations: builder.query({
      query: ({ email, page }) =>
        `/conversations?participants_like=${email}&_sort=timestamp&_order=desc&_page=${page}&_limit=${process.env.REACT_APP_CONVERSATION_PER_PAGE}`,
      async onQueryStarted(arg, { queryFulfilled, dispatch }) {
        try {
          const conversations = await queryFulfilled;
          if (conversations?.data?.length > 0) {
            // update conversation cache pessimistically start
            dispatch(
              apiSlice.util.updateQueryData(
                "getConversations",
                arg.email,
                (draft) => {
                  return {
                    data: [...draft.data, ...conversations.data],
                    totalCount: Number(draft.totalCount),
                  };
                }
              )
            );
            // update message cache pessimistically end
          }
        } catch (error) {}
      },
    }),
    getConversation: builder.query({
      query: ({ userEmail, participantEmail }) =>
        `/conversations?participants_like=${userEmail}-${participantEmail}&&participants_like=${participantEmail}-${userEmail}`,
    }),
    addConversation: builder.mutation({
      query: ({ sender, data }) => ({
        url: "/conversations",
        method: "POST",
        body: data,
      }),
      async onQueryStarted(arg, { queryFulfilled, dispatch }) {
        const conversation = await queryFulfilled;
        // dispatch(
        //   apiSlice.util.updateQueryData(
        //     "getConversations",
        //     arg.sender,
        //     (draft) => {
        //       draft.data.unshift(conversation.data);
        //     }
        //   )
        // );
        if (conversation?.data?.id) {
          const users = arg.data.users;
          const senderUser = users.find((user) => user.email === arg.sender);
          const receiverUser = users.find((user) => user.email !== arg.sender);
          // silent entry to message
          dispatch(
            messagesApi.endpoints.addMessage.initiate({
              conversationId: conversation?.data?.id,
              sender: senderUser,
              receiver: receiverUser,
              message: arg.data.message,
              timestamp: arg.data.timestamp,
            })
          );
        }
      },
    }),
    editConversation: builder.mutation({
      query: ({ sender, id, data }) => ({
        url: `/conversations/${id}`,
        method: "PATCH",
        body: data,
      }),
      async onQueryStarted(arg, { queryFulfilled, dispatch }) {
        // optimistic cache update start
        const patchResult = dispatch(
          apiSlice.util.updateQueryData(
            "getConversations",
            arg.sender,
            (draft) => {
              // console.log(JSON.stringify(draft?.data));
              const draftConversation = draft.data.find((c) => c.id == arg.id);
              draftConversation.message = arg.data.message;
              draftConversation.timestamp = arg.data.timestamp;
            }
          )
        );
        // optimistic cache update end
        try {
          const conversation = await queryFulfilled;
          if (conversation?.data?.id) {
            const users = arg.data.users;
            const senderUser = users.find((user) => user.email === arg.sender);
            const receiverUser = users.find(
              (user) => user.email !== arg.sender
            );
            // silent entry to message
            const res = await dispatch(
              messagesApi.endpoints.addMessage.initiate({
                conversationId: conversation?.data?.id,
                sender: senderUser,
                receiver: receiverUser,
                message: arg.data.message,
                timestamp: arg.data.timestamp,
              })
            ).unwrap();

            // update message cache pessimistically start

            // dispatch(
            //   apiSlice.util.updateQueryData(
            //     "getMessages",
            //     res.conversationId.toString(),
            //     (draft) => {
            //       draft.push(res);
            //     }
            //   )
            // );

            // update message cache pessimistically end
          }
        } catch (error) {
          patchResult.undo();
        }
      },
    }),
  }),
});

export const {
  useGetConversationsQuery,
  useGetConversationQuery,
  useAddConversationMutation,
  useEditConversationMutation,
} = conversationsApi;
