import { useAuth, SignInButton } from "@clerk/clerk-react";
import { useNavigate } from "react-router";
import { MessageCircleIcon } from "lucide-react";
import { useStartConversation } from "../hooks/useMessages";

// "Send Message" button for the seller of a product. Starts (or reuses) the conversation, then
// opens the chat. Hidden for the seller themselves (nobody can message themselves).
function MessageButton({ sellerId }) {
  const { isSignedIn, userId } = useAuth();
  const navigate = useNavigate();
  const startConversation = useStartConversation();

  if (!sellerId || userId === sellerId) return null;

  const buttonClass = "btn btn-primary btn-sm gap-2 w-full sm:w-auto";

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button className={buttonClass}>
          <MessageCircleIcon className="size-4" /> Send Message
        </button>
      </SignInButton>
    );
  }

  return (
    <div className="space-y-1">
      <button
        className={buttonClass}
        disabled={startConversation.isPending}
        onClick={() =>
          startConversation.mutate(sellerId, {
            onSuccess: (conversation) => navigate(`/messages/${conversation.id}`),
          })
        }
      >
        {startConversation.isPending ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          <MessageCircleIcon className="size-4" />
        )}
        Send Message
      </button>
      {startConversation.isError && (
        <p className="text-xs text-error">
          {startConversation.error?.response?.data?.error || "Couldn't open the chat. Try again."}
        </p>
      )}
    </div>
  );
}

export default MessageButton;
