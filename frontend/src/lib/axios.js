import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // send cookies with req so that authentication status is known
});

export default api;
//this api object will now be used whenever we want to send request to api