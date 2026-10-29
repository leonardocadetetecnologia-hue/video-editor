import React from "react";
import { Composition } from "remotion";
import { MainComposition } from "./MainComposition";
import { createProject } from "../lib/model/defaults";
import type { CompositionProps } from "../lib/model/types";
import { projectDuration } from "../lib/model/defaults";

const defaultProps: CompositionProps = {
  project: createProject({ id: "preview", name: "Preview", formatId: "ig-reels" }),
  assets: {},
  mediaBaseUrl: "",
  useProxies: false,
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Main"
    component={MainComposition}
    defaultProps={defaultProps}
    durationInFrames={30}
    fps={30}
    width={1080}
    height={1920}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(1, projectDuration(props.project)),
      fps: props.project.fps,
      width: props.project.width,
      height: props.project.height,
    })}
  />
);
