package com.roleimpact.workspace.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.SecureRandom;

import org.junit.jupiter.api.Test;

class WorkspaceCodeTest {

	@Test
	void normalizesTypedCodesWithOrWithoutTheHyphen() {
		var displayed = "NSM-0123456789ABCDEF0123456789ABCDEF";

		assertThat(WorkspaceCode.normalize(" " + displayed.toLowerCase() + " ")).isEqualTo(displayed);
		assertThat(WorkspaceCode.normalize(displayed.replace("-", ""))).isEqualTo(displayed);
	}

	@Test
	void rejectsMalformedOrAmbiguousCodes() {
		assertThat(WorkspaceCode.normalize("NSM-7K4P0D")).isNull();
		assertThat(WorkspaceCode.normalize("NSM-7K4P9D")).isNull();
		assertThat(WorkspaceCode.normalize("not-a-code")).isNull();
	}

	@Test
	void generatesANamePrefixAndA128BitRandomSuffix() {
		var code = new WorkspaceCode(new SecureRandom()).generate("Northstar Medical Supplies");

		assertThat(code).matches("NMS-[A-F0-9]{32}");
	}
}
