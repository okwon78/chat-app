# dev 컨테이너 — Vite dev 서버(프록시 포함)를 그대로 컨테이너에서 실행한다.
# 소스는 compose가 bind mount하므로 이미지에는 의존성만 설치한다(HMR 유지).
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
EXPOSE 5173
# --host 0.0.0.0: 컨테이너 밖(호스트 포트 매핑)에서 접근 가능해야 함
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
