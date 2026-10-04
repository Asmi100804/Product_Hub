import { useParams } from "react-router";
import { MessageCircleIcon } from "lucide-react";
import ConversationList from "../components/chat/ConversationList";
import ChatWindow from "../components/chat/ChatWindow";

// /messages            => inbox (full screen on mobile, left column on desktop)
// /messages/:conversationId => chat (full screen on mobile, right column on desktop)
function MessagesPage() {
  const { conversationId } = useParams();

  return (
    <div className="card bg-base-300 overflow-hidden h-[calc(100dvh-9rem)] min-h-[26rem]">
      <div className="grid grid-cols-1 md:grid-cols-[20rem_1fr] h-full min-h-0">
        <aside
          className={`${conversationId ? "hidden md:block" : "block"} border-base-content/10 md:border-r min-h-0`}
        >
          <ConversationList activeId={conversationId} />
        </aside>

        <section className={`${conversationId ? "block" : "hidden md:block"} min-h-0`}>
          {conversationId ? (
            <ChatWindow key={conversationId} conversationId={conversationId} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-base-content/50 p-6">
              <MessageCircleIcon className="size-12 mb-3 opacity-30" />
              <p className="font-medium">Select a conversation</p>
              <p className="text-sm">Your messages with buyers and sellers show up here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default MessagesPage;
