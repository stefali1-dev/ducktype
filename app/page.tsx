"use client";

import dynamic from "next/dynamic";

/** Client-only: the first snippet comes from localStorage and Math.random, so a server render would only flash the wrong one. */
export default dynamic(() => import("@/components/Trainer"), { ssr: false });
