import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ChevronRight, ExternalLink } from "lucide-react-native";
import { Linking, Platform, Pressable, View } from "react-native";
import {
	Body,
	Card,
	Display,
	GlassButton,
	Heading,
	Screen,
	TextLink,
} from "../../../components/brand";
import { CopyRow } from "../../../components/copy-row";
import { integrationLinks } from "../../../lib/integrations";
import { serverLabel } from "../../../lib/server";
import { useSession } from "../../../lib/session";
import { useTheme } from "../../../theme";

/** A tappable row inside a card: a label and a trailing glyph. */
function LinkRow({
	label,
	onPress,
	external = false,
}: {
	label: string;
	onPress: () => void;
	external?: boolean;
}) {
	const t = useTheme();
	const Glyph = external ? ExternalLink : ChevronRight;
	return (
		<Pressable
			accessibilityRole={external ? "link" : "button"}
			accessibilityLabel={label}
			onPress={onPress}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				minHeight: 44,
				opacity: pressed ? 0.6 : 1,
			})}
		>
			<Body weight="medium" style={{ flex: 1 }}>
				{label}
			</Body>
			<Glyph size={external ? 18 : 20} color={t.mutedInk} />
		</Pressable>
	);
}

export default function Integrations() {
	const router = useRouter();
	const { origin, site } = useSession();
	const links = integrationLinks(origin, site);
	const open = (url: string) => void WebBrowser.openBrowserAsync(url);

	return (
		<Screen masthead contentStyle={{ paddingBottom: 120 }}>
			<View style={{ gap: 8 }}>
				<Display size={32}>Integrations</Display>
				<Body tone="muted">Connect {serverLabel(origin)} to your tools.</Body>
			</View>

			<Card style={{ gap: 12 }}>
				<Heading>MCP server</Heading>
				<Body tone="muted" size={15}>
					For AI assistants. Send an API key in the x-api-key header.
				</Body>
				<CopyRow label="MCP endpoint" value={links.mcp} />
			</Card>

			<Card style={{ gap: 12 }}>
				<Heading>REST API</Heading>
				<CopyRow label="Base URL" value={links.api} />
				<LinkRow
					label="API keys"
					onPress={() => router.push("/account/api-keys")}
				/>
				<LinkRow
					external
					label="API reference"
					onPress={() => open(links.reference)}
				/>
			</Card>

			{Platform.OS === "ios" ? (
				<Card style={{ gap: 12 }}>
					<Heading>iOS Shortcut</Heading>
					<Body tone="muted" size={15}>
						Log an expense in one prompt, from the Action Button or Siri.
					</Body>
					<View style={{ gap: 6 }}>
						<Body size={15}>1. Create an API key.</Body>
						<Body size={15}>2. Add the shortcut.</Body>
						<Body size={15}>
							3. When asked, paste your key and this server URL.
						</Body>
					</View>
					<CopyRow label="Server URL" value={links.base} />
					<GlassButton
						label="Add the shortcut"
						// Safari hands .shortcut files to the Shortcuts app.
						onPress={() => void Linking.openURL(links.shortcut)}
					/>
					<TextLink onPress={() => void Linking.openURL(links.aiShortcut)}>
						AI shortcut for Messages
					</TextLink>
				</Card>
			) : null}

			<Card style={{ gap: 4 }}>
				<Heading>Help</Heading>
				<LinkRow
					external
					label="Help center"
					onPress={() => open(links.help)}
				/>
				<LinkRow
					external
					label="Documentation"
					onPress={() => open(links.docs)}
				/>
				<LinkRow
					external
					label="Privacy policy"
					onPress={() => open(links.privacy)}
				/>
				<LinkRow
					external
					label="Terms of service"
					onPress={() => open(links.terms)}
				/>
				{links.status ? (
					<LinkRow
						external
						label="Status page"
						onPress={() => open(links.status as string)}
					/>
				) : null}
				{links.support ? (
					<LinkRow
						external
						label="Contact support"
						onPress={() => void Linking.openURL(links.support as string)}
					/>
				) : null}
			</Card>
		</Screen>
	);
}
