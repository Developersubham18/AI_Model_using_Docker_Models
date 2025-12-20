# 🤖 AI Model – Docker Model Based Architecture

This project is an **AI-powered Virtual Assistant** built with a **Dockerized AI model**, a **Node.js backend**, and a **React.js frontend**.  
The AI model runs **internally inside Docker** (not exposed publicly), while the backend securely communicates with it and serves responses to the frontend.

---
## 🖥️ UI Preview

![AI Virtual Assistant UI](assets/ui-preview.png)

## 🚀 Tech Stack

### Frontend
- React.js
- Axios
- Modern UI (Chat-style interface)

### Backend
- Node.js
- Express.js
- REST APIs
- Runs on **EC2 – Port 5000**

### AI Model
- Docker Models (Gemma)
- Runs **internally on `localhost:12434`**
- Not publicly accessible (security-first design)

### Infrastructure
- AWS EC2
- Docker & Docker Hub
- Linux (Ubuntu)

---

## 🧠 Architecture Overview

Browser (React UI)
|
| HTTP Requests
v
Backend (Node.js :5000) ← Public
|
| Internal API Call
v
Docker AI Model (:12434) ← Internal Only


🔐 **Important:**  
- The AI model **cannot be accessed directly from the internet**
- Only the backend can communicate with the model
- This ensures **security, control, and scalability**

---

## ✨ Key Features

### 🔹 Docker Model Isolation
- AI model runs **inside Docker**
- Bound only to `localhost`
- Prevents unauthorized access

### 🔹 Secure Backend Proxy
- Backend acts as a **controlled gateway**
- Handles prompts, validation, and responses
- Frontend never talks to the model directly

### 🔹 Modular & Scalable Design
- Frontend, backend, and model are **decoupled**
- Easy to upgrade model without UI/backend changes
- Cloud-ready architecture

### 🔹 Production-Oriented Setup
- Similar to **real-world AI systems**
- Follows microservice principles
- Suitable for scaling with Kubernetes later
