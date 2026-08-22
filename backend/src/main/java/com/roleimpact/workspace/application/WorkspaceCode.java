package com.roleimpact.workspace.application;

import java.security.SecureRandom;
import java.text.Normalizer;
import java.util.Arrays;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

@Component
public class WorkspaceCode {

	private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	private static final int TOKEN_LENGTH = 16;
	private static final Pattern SHORT_COMPACT = Pattern.compile("^[A-HJ-NP-Z2-9]{19}$");
	private static final Pattern SHORT_DISPLAYED = Pattern.compile("^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{16}$");
	private static final Pattern LONG_COMPACT = Pattern.compile("^[A-HJ-NP-Z2-9]{3}[A-F0-9]{32}$");
	private static final Pattern LONG_DISPLAYED = Pattern.compile("^[A-HJ-NP-Z2-9]{3}-[A-F0-9]{32}$");

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
		StringBuilder token = new StringBuilder(TOKEN_LENGTH);
		for (int index = 0; index < TOKEN_LENGTH; index++) {
			token.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
		}
		return prefixSeed.substring(0, 3) + "-" + token;
	}

	public static String normalize(String rawCode) {
		if (rawCode == null) {
			return null;
		}
		String candidate = rawCode.trim().toUpperCase(Locale.ROOT);
		if (SHORT_COMPACT.matcher(candidate).matches() || LONG_COMPACT.matcher(candidate).matches()) {
			candidate = candidate.substring(0, 3) + "-" + candidate.substring(3);
		}
		return SHORT_DISPLAYED.matcher(candidate).matches() || LONG_DISPLAYED.matcher(candidate).matches()
				? candidate
				: null;
	}

	private static String sanitize(String value) {
		return value.replace('O', 'Q')
				.replace('I', 'J')
				.replace('0', '2')
				.replace('1', '3')
				.replaceAll("[^A-HJ-NP-Z2-9]", "");
	}
}
