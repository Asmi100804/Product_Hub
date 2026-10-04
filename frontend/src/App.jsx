import { SignedIn, SignedOut, SignInButton, SignOutButton } from "@clerk/clerk-react";
import Navbar from "./components/Navbar";
import { Navigate, Route, Routes } from "react-router";
import HomePage from "./pages/HomePage";
import ProductPage from "./pages/ProductPage";
import ProfilePage from "./pages/ProfilePage";
import CreatePage from "./pages/CreatePage";
import EditProductPage from "./pages/EditProductPage";
import MessagesPage from "./pages/MessagesPage";
import ChatSocketProvider from "./context/ChatSocketProvider";
import useAuthReq from "./hooks/useAuthReq";
import useUserSync from "./hooks/useUserSync";

function App() {
  const { isClerkLoaded, isSignedIn } = useAuthReq();
  useUserSync();

  if (!isClerkLoaded) return null;

  return (
    <ChatSocketProvider>
    <div className="min-h-screen bg-base-100">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/product/:id" element={<ProductPage />} />
          <Route path="/profile" element={isSignedIn ? <ProfilePage /> : <Navigate to={"/"} />} />
          <Route path="/create" element={isSignedIn ? <CreatePage /> : <Navigate to={"/"} />} />
          <Route
            path="/edit/:id"
            element={isSignedIn ? <EditProductPage /> : <Navigate to={"/"} />}
          />
          <Route path="/messages" element={isSignedIn ? <MessagesPage /> : <Navigate to={"/"} />} />
          <Route
            path="/messages/:conversationId"
            element={isSignedIn ? <MessagesPage /> : <Navigate to={"/"} />}
          />
        </Routes>
      </main>
    </div>
    </ChatSocketProvider>
  );
}

export default App;
