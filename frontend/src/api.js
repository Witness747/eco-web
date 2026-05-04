import axios from "axios";

const API = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "http://localhost:8000/api";

export const sendMessage    = (msg)      => axios.post(`${API}/chat`, { message: msg });
export const analyzeProduct = (formData) => axios.post(`${API}/analyze-product`, formData);
export const getHistory     = ()         => axios.get(`${API}/history`);
export const getTrash       = ()         => axios.get(`${API}/trash`);
export const deleteMessage  = (id)       => axios.delete(`${API}/chat/${id}`);
export const restoreMessage = (id)       => axios.post(`${API}/recover/${id}`);
export const purgeSession   = ()         => axios.delete(`${API}/purge`);
