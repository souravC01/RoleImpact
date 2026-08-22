package com.roleimpact.workspace.application;

import java.security.SecureRandom;
import java.text.Normalizer;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

@Component
public class WorkspaceCode {

	private static final int TOKEN_BYTES = 16;
	private static final Pattern SECURE_COMPACT = Pattern.compile("^[A-HJ-NP-Z2-9]{3}[A-F0-9]{32}$");
	private static final Pattern SECURE_DISPLAYED = Pattern.compile("^[A-HJ-NP-Z2-9]{3}-[A-F0-9]{32}$");

	private final SecureRandom random;

	public WorkspaceCode() {
		this(new SecureRandom());
	}

	WorkspaceCode(SecureRandom random) {
		this.random = random;
	}

	public String generate(String organizationName) {
		String asciiName = Normalizer.normalize(organizationName, Normalizer.Form.NFD)
				.replaceAll("\\p{M}", "")
				.toUpperCase(Locale.ROOT);
		String initials = Arrays.stream(asciiName.split("[^A-Z0-9]+"))
				.filter(token -> !token.isBlank())
				.map(token -> token.substring(0, 1))
				.collect(Collectors.joining());
		String compactName = asciiName.replaceAll("[^A-Z0-9]", "");
		String prefixSeed = sanitize(initials + compactName + "ORG");
		byte[] token = new byte[TOKEN_BYTES];
		random.nextBytes(token);
		return prefixSeed.substring(0, 3) + "-" + HexFormat.of().withUpperCase().formatHex(token);
	}

	public static String normalize(String rawCode) {
		if (rawCode == null) {
			return null;
		}
		String candidate = rawCode.trim().toUpperCase(Locale.ROOT);
		if (SECURE_COMPACT.matcher(candidate).matches()) {
			candidate = candidate.substring(0, 3) + "-" + candidate.substring(3);
		}
		return SECURE_DISPLAYED.matcher(candidate).matches() ? candidate : null;
	}

	private static String sanitize(String value) {
		return value.replace('O', 'Q')
				.replace('I', 'J')
				.replace('0', '2')
				.replace('1', '3')
				.replaceAll("[^A-HJ-NP-Z2-9]", "");
	}
}
