import { useCallback, useEffect, useRef } from "react";
import { type ImageSourcePropType, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, Image, Text } from "react-native-svg";
import { useTheme } from "../theme";

/** Native tabs accept bitmaps, not React views. Snapshot a circular avatar at 3×. */
export function TabAvatar({
	name,
	image,
	onSource,
}: {
	name: string;
	image?: string | null;
	onSource: (source: ImageSourcePropType) => void;
}) {
	const t = useTheme();
	const svg = useRef<Svg>(null);
	const alive = useRef(true);
	const lastSnapshot = useRef<string | undefined>(undefined);
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const initials =
		parts.length > 1
			? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
			: (parts[0]?.slice(0, 2).toUpperCase() ?? "?");

	const capture = useCallback(() => {
		svg.current?.toDataURL(
			(base64) => {
				if (alive.current && base64 !== lastSnapshot.current) {
					lastSnapshot.current = base64;
					onSource({
						uri: `data:image/png;base64,${base64}`,
						width: 28,
						height: 28,
						scale: 3,
					});
				}
			},
			{ width: 84, height: 84 },
		);
	}, [onSource]);

	useEffect(() => {
		alive.current = true;
		// Also renders initials while a remote photo is loading or if it fails.
		const frame = requestAnimationFrame(capture);
		return () => {
			alive.current = false;
			cancelAnimationFrame(frame);
		};
	}, [capture]);

	return (
		<View
			pointerEvents="none"
			accessible={false}
			importantForAccessibility="no-hide-descendants"
			style={{ position: "absolute", left: -100, top: -100 }}
		>
			<Svg ref={svg} width={84} height={84} viewBox="0 0 28 28">
				<Defs>
					<ClipPath id="avatar">
						<Circle cx={14} cy={14} r={14} />
					</ClipPath>
				</Defs>
				<Circle cx={14} cy={14} r={14} fill={t.muted} />
				<Text
					x={14}
					y={18}
					textAnchor="middle"
					fontSize={11}
					fontWeight="600"
					fill={t.ink}
				>
					{initials}
				</Text>
				{image ? (
					<Image
						href={{ uri: image }}
						width={28}
						height={28}
						preserveAspectRatio="xMidYMid slice"
						clipPath="url(#avatar)"
						onLoad={capture}
					/>
				) : null}
			</Svg>
		</View>
	);
}
