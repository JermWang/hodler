import { Composition } from "remotion";
import { AmpliFiIntro } from "./compositions/AmpliFiIntro";
import { AmpliFiShowcase } from "./compositions/AmpliFiShowcase";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AmpliFiIntro"
        component={AmpliFiIntro}
        durationInFrames={450} // 15 seconds at 30fps
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="AmpliFiShowcase"
        component={AmpliFiShowcase}
        durationInFrames={750} // 25 seconds at 30fps
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
