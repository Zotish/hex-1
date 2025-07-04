import type { NextPage } from "next";
import Head from "next/head";
import { HomeView } from "../views";

const Home: NextPage = (props) => {
  return (
    <div>
      <Head>
        <title>HexSkull</title>
        <meta
          name="description"
          content="HexSkull"
        />
      </Head>
      <HomeView />
    </div>
  );
};

export default Home;
