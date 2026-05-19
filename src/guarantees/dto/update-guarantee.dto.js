"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateGuaranteeDto = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const create_guarantee_dto_1 = require("./create-guarantee.dto");
class UpdateGuaranteeDto extends (0, mapped_types_1.PartialType)(create_guarantee_dto_1.CreateGuaranteeDto) {
}
exports.UpdateGuaranteeDto = UpdateGuaranteeDto;
//# sourceMappingURL=update-guarantee.dto.js.map