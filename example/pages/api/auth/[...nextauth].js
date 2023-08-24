import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { Config } from "sst/node/config";

export const authOptions = {
  providers: [
    GithubProvider({
      clientId: Config.GITHUB_CLIENT_ID,
      clientSecret: Config.GITHUB_CLIENT_SECRET,
    }),
  ],
  secret: Config.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
