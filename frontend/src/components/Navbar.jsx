import { Link } from "react-router";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/clerk-react";
import {
  ShoppingBagIcon,
  PlusIcon,
  UserIcon,
  MessageCircleIcon,
  MenuIcon,
} from "lucide-react";
import ThemeSelector from "./ThemeSelector";
import NotificationsMenu from "./NotificationsMenu";
import { useUnreadCount } from "../hooks/useMessages";

function Navbar() {
  const { isSignedIn } = useAuth();
  const { data: unreadMessages = 0 } = useUnreadCount();

  const closeMenu = () => document.activeElement?.blur();

  return (
    <div className="navbar bg-base-300 min-h-14 px-0 sticky top-0 z-40">
      <div className="max-w-5xl mx-auto w-full px-2 sm:px-4 flex justify-between items-center gap-1">
        {/* LOGO - LEFT SIDE */}
        <div className="flex-1 min-w-0">
          <Link to="/" className="btn btn-ghost gap-2 px-2 sm:px-4" aria-label="ProductHub home">
            <ShoppingBagIcon className="size-5 text-primary shrink-0" />
            <span className="hidden min-[420px]:inline text-base sm:text-lg font-bold font-mono uppercase tracking-wider">
              ProductHub
            </span>
          </Link>
        </div>

        {/* ACTIONS - RIGHT SIDE (order-* controls the mobile vs desktop order) */}
        <div className="flex gap-0.5 sm:gap-2 items-center shrink-0">
          <div className="order-3 sm:order-2">
            <ThemeSelector />
          </div>

          {isSignedIn ? (
            <>
              {/* New Product: button on sm+, inside the menu on mobile */}
              <Link
                to="/create"
                className="hidden sm:inline-flex order-2 btn btn-primary btn-sm gap-1"
              >
                <PlusIcon className="size-4" />
                New Product
              </Link>

              <Link
                to="/messages"
                className="order-4 sm:order-3 btn btn-ghost btn-sm btn-square indicator"
                aria-label={unreadMessages ? `Messages, ${unreadMessages} unread` : "Messages"}
              >
                <MessageCircleIcon className="size-4" />
                {unreadMessages > 0 && (
                  <span className="indicator-item badge badge-primary badge-xs">
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                )}
              </Link>

              <div className="order-5 sm:order-4">
                <NotificationsMenu />
              </div>

              {/* Profile: button on sm+, inside the menu on mobile */}
              <Link
                to="/profile"
                className="hidden sm:inline-flex order-1 btn btn-ghost btn-sm gap-1"
              >
                <UserIcon className="size-4" />
                Profile
              </Link>

              {/* mobile menu */}
              <div className="order-1 sm:hidden dropdown dropdown-end">
                <div
                  tabIndex={0}
                  role="button"
                  className="btn btn-ghost btn-sm btn-square"
                  aria-label="Menu"
                >
                  <MenuIcon className="size-4" />
                </div>
                <ul
                  tabIndex={0}
                  className="dropdown-content menu bg-base-200 rounded-box z-50 mt-3 w-44 p-2 shadow-xl"
                >
                  <li>
                    <Link to="/create" onClick={closeMenu}>
                      <PlusIcon className="size-4" /> New Product
                    </Link>
                  </li>
                  <li>
                    <Link to="/profile" onClick={closeMenu}>
                      <UserIcon className="size-4" /> Profile
                    </Link>
                  </li>
                </ul>
              </div>

              <div className="order-6 sm:order-5 flex items-center pl-1">
                <UserButton />
              </div>
            </>
          ) : (
            <>
              <SignInButton mode="modal">
                <button className="order-2 btn btn-ghost btn-xs sm:btn-sm px-2">Sign In</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="order-3 btn btn-primary btn-xs sm:btn-sm px-2">
                  Get Started
                </button>
              </SignUpButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export default Navbar;
