package com.roleimpact.workspace.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.SecureRandom;

import org.junit.jupiter.api.Test;

class WorkspaceCodeTest {

	@Test
	void normalizesTypedCodesWithOrWithoutTheHyphen() {
		var displayed = "NSM-7K4P9D8XM2QR6WBC";

		assertThat(WorkspaceCode.normalize(" " + displayed.toLowerCase() + " ")).isEqualTo(displayed);
		assertThat(WorkspaceCode.normalize(displayed.replace("-", ""))).isEqualTo(displayed);
	}

	@Test
	void keepsExistingLongCodesValid() {
		var existing = "NSM-0123456789ABCDEF0123456789ABCDEF";

		assertThat(WorkspaceCode.normalize(existing)).isEqualTo(existing);
	}

	@Test
	void rejectsMalformedOrAmbiguousCodes() {
		assertThat(WorkspaceCode.normalize("NSM-7K4P0D")).isNull();
		assertThat(WorkspaceCode.normalize("NSM-7K4P9D")).isNull();
		assertThat(WorkspaceCode.normalize("not-a-code")).isNull();
	}

	@Test
	void generatesANamePrefixAndAn80BitRandomSuffix() {
		var code = new WorkspaceCode(new SecureRandom()).generate("Northstar Medical Supplies");

		assertThat(code).matches("NMS-[A-HJ-NP-Z2-9]{16}");
	}
}
